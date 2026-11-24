import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {crc32,deflateRawSync} from 'node:zlib';
import trainingRanks from '../assets/training-ranks.json' with {type:'json'};
import skillIcons from '../assets/skill-icons.json' with {type:'json'};
import {representativeCard} from './ddt2.mjs';
import skills from '../assets/skill-names.json' with {type:'json'};
import {heatFor,requireThat,totals,reviewRace} from './domain.mjs';
import {seriesRows} from './series.mjs';
import {umaFor} from './broadcast.mjs';

export const roundName=m=>({R1:'Round 1',R2:'Round 2 / Quarterfinals',R3:'Semifinals',R4:'Grand Final'})[m?.siteRoundId]||m?.round||'';
export const raceName=n=>n===7?'Tiebreaker':'Race '+n;

export function matchExport(bundle,matchId){
 const match=bundle.series?.matches.find(m=>m.id===matchId);
 requireThat(match?.siteMatchId && match.status==='confirmed' && match.teams.some(t=>t.id===match.winnerId && t.points>=match.target),'Confirm the matchup winner in Finalize before downloading.');
 const results=bundle.results.filter(r=>r.match.id===matchId);
 const standings=Object.fromEntries([['players','player'],['teams','team']].map(([key,group])=>[key,totals(results,group,bundle.tournament.scoring.tiebreak)]));
 return {...bundle,results,standings,voided:[],series:{...bundle.series,matches:[match]}};
}

export function packageZip(bundle,captures=[]){
 const files=[{name:'approved-results.json',data:Buffer.from(JSON.stringify(bundle))},...captures];
 const bodies=[],directory=[];
 let offset=0,centralSize=0;
 for(const file of files){
 const name=Buffer.from(file.name),data=file.data;
 const compressed=deflateRawSync(data),sum=crc32(data);
 const local=Buffer.alloc(30),central=Buffer.alloc(46);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
 local.writeUInt32LE(sum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);local.copy(central,6,4,28);
 central.writeUInt32LE(offset,42);
 bodies.push(local,name,compressed);directory.push(central,name);
 offset+=local.length+name.length+compressed.length;centralSize+=central.length+name.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...bodies,...directory,end]);
}

export async function captureFiles(bundle,directory){
 const files=[];
 for(const result of [...bundle.results].sort((a,b)=>a.heat.number-b.heat.number)){
  requireThat(/^[a-f0-9]{64}$/.test(result.fingerprint),'Invalid capture fingerprint.');
  const data=await readFile(path.join(directory,'raw',result.fingerprint+'.json')).catch(error=>{
   if(error.code==='ENOENT')throw Error('Capture for Race '+result.heat.number+' is missing. Restore it before exporting.');
   throw error;
  });
  files.push({name:'races/race-'+result.heat.number+'.json',data});
 }
 return files;
}

export function spotlightRoster(state,match){
 const heats=new Set(match.heats.map(h=>h.id));
 const capture=state.races.find(r=>heats.has(r.heatId)&&r.status!=='void'&&r.runners.length===10);
 if(!capture)return null;
 const rows=capture.approval?.result?.rows || reviewRace(state,capture).rows;
 return {raceId:capture.id,choices:rows.map(r=>({index:r.index,uma:r.name,player:r.playerName||r.trainer,gate:r.gate})).sort((a,b)=>a.gate-b.gate)};
}

export function runnerBuild(h={}){
 const r=h.responseHorseData||{},c=h.trainedCharaData||{},p=h.raceParam||{};
 const stats={},aptitudes={};
 for(const [label,param,key] of [['Speed','rawSpeed','speed'],['Stamina','rawStamina','stamina'],['Power','rawPow','power'],['Guts','rawGuts','guts'],['Wit','rawWiz','wiz']]){
  const value=p[param]??c[key]??r[key];if(Number.isFinite(value))stats[label]=value;
 }
 for(const [label,key] of Object.entries({Turf:'ground_turf',Dirt:'ground_dirt',Sprint:'distance_short',Mile:'distance_mile',Medium:'distance_middle',Long:'distance_long',Front:'running_style_nige',Pace:'running_style_senko',Late:'running_style_sashi',End:'running_style_oikomi'})){
  const camel='proper'+key.split('_').map(k=>k[0].toUpperCase()+k.slice(1)).join('');
  const grade=r['proper_'+key]??c[camel];if(Number.isInteger(grade)&&grade>=1&&grade<=8)aptitudes[label]='GFEDCBAS'[grade-1];
 }
 const list=r.skill_array??c.skillArray??[];
 return {stats,aptitudes,support:(c.supportCardArray||[]).map(s=>({id:s.supportCardId??s.support_card_id??s.id})).filter(s=>Number.isInteger(s.id)),skills:list.map(s=>{
  const id=s.skill_id??s.skillId;
  const [icon,rarity]=skillIcons[id]||[];
  const nativeUnique=[3,4,5].includes(rarity);
  return {id,name:skills[id]||s.name||('Skill '+id),level:nativeUnique?(s.level??s.skill_level??null):null,icon,rarity};
 })};
}

export function finalized(state,heatId){
 if(!heatId)return null;
 const {match,heat}=heatFor(state,heatId);
 const race=seriesRows(state,match).find(r=>r.heatId===heatId);
 if(!race)return null;
 return {match:match.name,round:roundName(match),race:raceName(heat.number),manual:race.manual,
  rows:race.rows.map(r=>({...r,uma:umaFor(r.card||match.lineup?.[r.playerId],r.name),
   teamCard:representativeCard(state.tournament.teams?.find(t=>t.id===r.teamId||t.name===r.team)||{},state.tournament.id)}))};
}
export function spotlightRating(horse){
 const trained=horse.trainedCharaData||{},entry=horse.responseHorseData||{};
 const score=trained.rankScore??entry.rank_score;
 const rating=Number.isSafeInteger(score)&&score>=0?score:null;
 const grade=trained.rank||entry.final_grade;
 const index=Number.isInteger(grade)&&grade>0?grade-1:
  rating===null?-1:trainingRanks.findLastIndex(([minimum])=>rating>=minimum);
 const rank=trainingRanks[index];
 return {rating,rank:rank?{label:rank[1],index}:null};
}
export async function highlight(state,directory,choice){
 if(!choice)return null;
 const race=state.races.find(r=>r.id===choice.raceId&&r.status!=='void');
 const row=race?.runners.find(r=>r.index===choice.index);
 if(choice.matchId && !state.matches.find(m=>m.id===choice.matchId)?.heats.some(h=>h.id===race?.heatId))return null;
 if(!race||!row||!/^([0-9a-f]{64})$/.test(race.fingerprint))return null;
 const raw=JSON.parse((await readFile(path.join(directory,'raw',race.fingerprint+'.json'),'utf8')).replace(/^\uFEFF/,''));
 const mapped=(race.approval?.result?.rows||reviewRace(state,race).rows).find(r=>r.index===row.index);
 const player=state.tournament.players.find(p=>p.id===mapped?.playerId);
 const horse=raw.raceHorse[row.index];
 const matchId=choice.matchId||state.matches.find(m=>m.heats.some(h=>h.id===race.heatId))?.id;
 const activeRace=player&&matchId&&state.races.find(r=>r.heatId===state.activeHeatId&&r.status==='approved'&&r.approval?.result?.match?.id===matchId);
 const activeStyle=activeRace?.approval.result.rows.find(r=>r.playerId===player.id)?.style;
 const runningStyle=activeStyle||horse.responseHorseData?.running_style||horse.trainedCharaData?.runningStyle||null;
 return {...spotlightRating(horse),runningStyle,player:player?.name||row.trainer,team:player?.team,teamCard:representativeCard(state.tournament.teams?.find(t=>t.id===player?.teamId)||{},state.tournament.id),
  uma:umaFor(row.card,row.name)||{name:row.name},...runnerBuild(horse)};
}


export async function enrichPackage(bundle,directory){
 const match=bundle.series.matches[0],builds={};
 for(const result of [...bundle.results].sort((a,b)=>a.heat.number-b.heat.number)){
  if(result.rows.every(row=>builds[row.playerId]))continue;
  requireThat(/^[a-f0-9]{64}$/.test(result.fingerprint),'Invalid capture fingerprint.');
  let capture;
  try{capture=JSON.parse((await readFile(path.join(directory,'raw',result.fingerprint+'.json'),'utf8')).replace(/^\uFEFF/,''));}
  catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const row of result.rows){if(!builds[row.playerId]&&capture.raceHorse?.[row.index])builds[row.playerId]=runnerBuild(capture.raceHorse[row.index]);}
 }
 match.builds=builds;return bundle;
}
