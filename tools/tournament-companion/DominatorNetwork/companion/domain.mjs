import {createHash,randomUUID} from 'node:crypto';
export class InputError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const requireThat=(ok,message,status=400)=>{if(!ok)throw new InputError(message,status);};
export const id=()=>randomUUID();
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const cleanName=value=>String(value??'').trim().replace(/^@+/,'');
export function text(value,label,max=120){requireThat(typeof value==='string'&&value.trim().length>0&&value.length<=max,`${label} is required (maximum ${max} characters).`);return value.trim();}
export function initialState(name='DOMINATOR NETWORK') {return {schema:1,revision:0,tournament:{id:id(),name,rules:null,players:[]},matches:[],activeHeatId:null,armedHeatId:null,races:[],audit:[],watch:{folder:'',enabled:false},github:{owner:'',repo:'',branch:'',file:''},publications:[]};}
export function rulesFrom(raw){
 if(raw==null)return null;
 requireThat(Array.isArray(raw.points)&&raw.points.length>0&&raw.points.length<=32,'Enter points for at least one finishing position.');
 requireThat(raw.points.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000),'Points must be numbers from 0 to 100000.');
 requireThat(['shared','countback'].includes(raw.tiebreak),'Choose shared rank or countback for ties.');
 return {points:raw.points,tiebreak:raw.tiebreak,aggregation:'sum',unlistedPlaces:0};
}
export function playersFrom(rows){
 requireThat(Array.isArray(rows)&&rows.length<=256,'Up to 256 participants are supported.');
 const keys=new Set(),ids=new Set();
 return rows.map(row=>{const player={id:row.id||id(),name:text(row.name,'Player name'),gameName:cleanName(text(row.gameName,'In-game name')),team:String(row.team||'').trim().slice(0,100)};
  requireThat(typeof player.id==='string'&&/^[\w-]{1,80}$/.test(player.id)&&!ids.has(player.id),'Participant IDs must be unique.');ids.add(player.id);
  requireThat(!keys.has(player.gameName),`In-game name is duplicated: ${player.gameName}.`);keys.add(player.gameName);return player;
 });
}
export function heatFor(state,heatId){for(const match of state.matches){const heat=match.heats.find(h=>h.id===heatId);if(heat)return {match,heat};}throw new InputError('Select an existing heat.');}
export function readRace(raw){
 requireThat(raw&&Array.isArray(raw.raceHorse)&&raw.raceHorse.length>=1&&raw.raceHorse.length<=32,'This is not a supported horseACT race export.');
 const rows=raw.raceHorse,n=rows.length,orders=rows.map(r=>r.finishOrder).sort((a,b)=>a-b);
 const zeroBased=orders.every((x,i)=>Number.isInteger(x)&&x===i),oneBased=orders.every((x,i)=>Number.isInteger(x)&&x===i+1);
 requireThat(zeroBased||oneBased,'Official finish order is missing, duplicated or incomplete.');
 requireThat(rows.every(r=>Number.isFinite(r.finishTimeRaw)&&r.finishTimeRaw>0),'Official finish times are incomplete.');
 const enumValue=(v,map)=>typeof v==='number'?v:map[v]??0;
 const course=raw.raceCourseSet||{};
 const track={id:course.raceTrackId??0,name:typeof raw.raceTrack?.name==='string'?raw.raceTrack.name:'',distance:course.distance??0,surface:course.ground??0,
  going:enumValue(raw.groundCondition,{Good:1,Soft:2,Hard:3,Bad:4}),weather:enumValue(raw.weather,{Sunny:1,Cloudy:2,Rainy:3,Snow:4}),season:enumValue(raw.season,{Spring:1,Summer:2,Fall:3,Winter:4,CherryBlossom:5})};
 requireThat(Number.isFinite(track.distance)&&track.distance>0,'Race distance is missing.');
 const gates=rows.map(r=>r.responseHorseData?.frame_order),validGates=gates.every(g=>Number.isInteger(g)&&g>=1&&g<=n)&&new Set(gates).size===n;
 const runners=rows.map((r,index)=>({index,gate:validGates?gates[index]:index+1,post:Number.isInteger(r.postNumber)?r.postNumber:null,rank:r.finishOrder+(zeroBased?1:0),name:String(r.charaName||`Runner ${index+1}`).slice(0,160),
  card:Number(r.responseHorseData?.card_id)||0,trainer:cleanName(r.trainerName||r.responseHorseData?.owner_trainer_name||r.responseHorseData?.trainer_name),owner:cleanName(r.responseHorseData?.owner_trainer_name),style:r.responseHorseData?.running_style??0,finishTime:r.finishTimeRaw})).sort((a,b)=>a.rank-b.rank);
 // File names and JSON whitespace do not identify a race. Include the simulation
 // and normalized result so reopening/re-exporting a replay cannot score twice.
 const fingerprint=digest({track,seed:raw.randomSeed??null,sim:raw.simDataBase64??null,runners});
 return {fingerprint,track,runners,raceType:String(raw.raceType||'Unknown'),sourceVersion:String(raw.horseACT_version||'Unknown')};
}
export function reviewRace(state,race){
 const problems=[];let match=null,heat=null;
 if(!race.heatId)problems.push('Assign this race to a match and heat.');else {try{({match,heat}=heatFor(state,race.heatId));}catch(e){problems.push(e.message);}}
 const rules=state.tournament.rules;if(!rules)problems.push('Scoring format is not configured.');
 const selected=match?state.tournament.players.filter(p=>match.playerIds.includes(p.id)):[];
 const mapped=race.runners.map(r=>{const manual=race.mapping?.[r.index];const player=manual?selected.find(p=>p.id===manual):selected.find(p=>p.gameName===r.trainer);
  if(!player)problems.push(`Assign gate ${r.gate} (${r.trainer||'player name unavailable'}) to a registered participant.`);
  return {...r,playerId:player?.id??null,playerName:player?.name??r.trainer,team:player?.team??'',teamId:player?.teamId??null,points:rules?(rules.points[r.rank-1]??0):null};});
 if(match){
  for(const pid of match.playerIds)if(!mapped.some(r=>r.playerId===pid))problems.push(`Missing participant: ${state.tournament.players.find(p=>p.id===pid)?.name||pid}.`);
  if(match.expected.distance&&match.expected.distance!==race.track.distance)problems.push(`Expected ${match.expected.distance} m; file contains ${race.track.distance} m.`);
  if(match.expected.surface&&match.expected.surface!==race.track.surface)problems.push('Race surface differs from the match.');
  if(match.expected.trackId&&match.expected.trackId!==race.track.id)problems.push('Racecourse differs from the match.');
  if(state.races.some(r=>r.id!==race.id&&r.heatId===race.heatId&&r.status==='approved'))problems.push('This heat already has an approved result. Void it before approving a rerun.');
 }
 const result={raceId:race.id,match:match?{id:match.id,name:match.name,round:match.round,stage:match.stage}:null,heat:heat?{id:heat.id,number:heat.number}:null,track:race.track,rows:mapped,rules,problems:[...new Set(problems)]};
 return {...result,hash:digest({result,revision:state.revision}),canApprove:problems.length===0&&race.status==='pending'};
}
export function totals(results,key,tiebreak='shared'){
 const grouped=new Map();
 for(const result of results)for(const row of result.rows){const group=key==='team'?row.team:row.playerId;if(!group)continue;
  const current=grouped.get(group)||{id:group,name:key==='team'?row.team:row.playerName,points:0,finishes:Array(32).fill(0),entries:0};
  current.points=Math.round((current.points+row.points)*1000000)/1000000;current.finishes[row.rank-1]++;current.entries++;grouped.set(group,current);
 }
 const compare=(a,b)=>{if(a.points!==b.points)return b.points-a.points;if(tiebreak==='countback')for(let i=0;i<32;i++)if(a.finishes[i]!==b.finishes[i])return b.finishes[i]-a.finishes[i];return 0;};
 const sorted=[...grouped.values()].sort((a,b)=>compare(a,b)||a.name.localeCompare(b.name));
 let previous=null,rank=0;return sorted.map((r,i)=>{if(!previous||compare(previous,r)!==0)rank=i+1;previous=r;return {...r,rank};});
}
export function publicBundle(state){
 const results=state.races.filter(r=>r.status==='approved').map(r=>({...r.approval.result,approvedAt:r.approval.at,operator:r.approval.operator,fingerprint:r.fingerprint}));
 return {schema:'dominator-tournament/v1',tournament:{id:state.tournament.id,name:state.tournament.name,scoring:state.tournament.rules},results,
  standings:{players:totals(results,'player',state.tournament.rules?.tiebreak),teams:totals(results,'team',state.tournament.rules?.tiebreak)},
  voided:state.races.filter(r=>r.status==='void').map(r=>({raceId:r.id,heatId:r.heatId,reason:r.voidReason}))};
}
