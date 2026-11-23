const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const demo=new URLSearchParams(location.search).get('demo')==='1',scoreboard=location.pathname==='/scoreboard';
document.body.classList.toggle('scoreboard',scoreboard);$('scoreboard-view').hidden=!scoreboard;$('matchup-view').hidden=scoreboard;$('preview-label').hidden=!demo;$('scene-label').textContent=scoreboard?'SERIES SCORE':'THE MATCHUP';
function fit(){$('canvas').style.transform=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;}
addEventListener('resize',fit);fit();
function crest(id){return /^[a-z0-9-]+$/.test(id||'')?`/assets/ddt2/crests/${id}.svg`:'/assets/ddt2/crown.svg';}
function crestImage(id){const image=make('img');image.src=crest(id);image.alt='';image.onerror=()=>{image.onerror=null;image.src='/assets/ddt2/crown.svg';};return image;}
function teamPortrait(team, onMissing) {
 const card=team.representative?.card;
 if(!Number.isInteger(card)||card<=0)return null;
 const image=make('img');
 image.alt=[team.representative.name,team.representative.outfit].filter(Boolean).join(' · ');
 image.onerror=()=>onMissing(image);
 image.src=`/assets/cards/${card}.png`;
 return image;
}
function teamHeading(key,team){
 const portrait=$('portrait-'+key);
 const image=teamPortrait(team,failed=>{if(failed.parentNode===portrait)portrait.hidden=true;});
 portrait.replaceChildren(...(image?[image]:[]));portrait.hidden=!image;
 $('name-'+key).textContent=team.name;
 $('score-'+key).textContent=team.points;
}
function art(uma,cls){const image=make('img',null,cls);image.src=uma.art||`/assets/cards/${uma.card}.png`;image.alt=uma.name+(uma.outfit?` (${uma.outfit})`:'');let fallback=false;image.onerror=()=>{if(!fallback&&uma.art){fallback=true;image.src=`/assets/cards/${uma.card}.png`;}else{image.hidden=true;}};return image;}
const statusText={'not-started':'READY FOR RACE 1','in-progress':'SERIES IN PROGRESS','awaiting-confirmation':'25 POINTS REACHED · AWAITING OUTCOME CONFIRMATION','tiebreaker-required':'SIX RACES COMPLETE · TIEBREAKER NEXT','confirmed':'SERIES CONFIRMED','manual-score':'OPERATOR-APPROVED TOTALS','outcome-needs-review':'OUTCOME AWAITS REVIEW'};
let signature='';
function show(data){const s=data.series;const next=JSON.stringify(data);if(signature===next)return;signature=next;
 $('event-title').textContent=data.tournament||'DOMINATOR DRAFT TOURNAMENT 2';$('round').textContent=s?`${s.stage} · ${s.round}`:'MATCHUP TO BE ANNOUNCED';$('status').textContent=s?.winnerId?`${s.teams.find(t=>t.id===s.winnerId)?.name||'TEAM'} · SERIES WINNER`:statusText[s?.status]||'SELECT A MATCHUP IN THE TOURNAMENT DESK';
 const teams=s?.teams||[{id:'',name:'Team A',points:0},{id:'',name:'Team B',points:0}];
 if(!scoreboard){for(const [i,key] of ['a','b'].entries()){const team=teams[i];teamHeading(key,team);$('players-'+key).replaceChildren(...(team.players||Array.from({length:5},()=>({name:'Player to be announced'}))).map((player,n)=>{const card=make('article',null,'player-card');card.style.setProperty('--delay',`${n*70}ms`);card.append(make('span',String(n+1).padStart(2,'0'),'slot-number'));if(player.uma)card.append(art(player.uma,'player-art'));else card.append(make('div',null,'empty-uma'));const info=make('div',null,'player-info');info.append(make('h2',player.name),make('div',player.uma?.name||'Uma to be announced','uma-name'),make('span',player.uma?.outfit||'','uma-outfit'));card.append(info);return card;}));}$('lineup-race').textContent=data.heat?`${data.heat.number===7?'TIEBREAKER':'RACE '+data.heat.number} LINEUP${data.heat.trackName?' · '+data.heat.trackName:''}`:'LINEUPS TO BE ANNOUNCED';}
 if(scoreboard){$('score-rows').replaceChildren(...teams.map(team=>{const tr=make('tr'),name=make('td',null,'team-cell'),group=make('div');group.append(teamPortrait(team,image=>image.replaceWith(crestImage(team.id)))||crestImage(team.id),make('strong',team.name));name.append(group);tr.append(name);for(let n=1;n<=7;n++){const col=data.columns?.find(c=>c.number===n),cell=make('td',null,'score-cell'+(!col?.played?' unplayed':'')+(data.heat?.number===n?' current':''));cell.append(make('span',col?.played?col.cumulative[team.id]:'—','score-value'),make('span',col?.played?`+${col.points[team.id]} THIS RACE`:'','score-delta'));tr.append(cell);}const total=make('td',null,'score-total');total.append(make('span',team.points,'score-value'),make('span',s?.manualOverride?'OVERRIDE':'SERIES POINTS','score-delta'));tr.append(total);return tr;}));
  $('podium-title').textContent=data.previous?`${data.previous.number===7?'TIEBREAKER':'RACE '+data.previous.number} · TOP THREE`:'THE LAST RACE';$('podium-note').textContent=data.previous?(data.previous.manual?'MANUAL PODIUM · APPROVED':'APPROVED RESULT · POINTS FROM THIS RACE'):'Waiting for an approved result';
  $('podium').replaceChildren(...(data.previous?.podium||[null,null,null]).map((row,i)=>{const card=make('article',null,'finisher'+(!row?' placeholder':''));if(!row){card.textContent=['1ST · 4 POINTS','2ND · 2 POINTS','3RD · 1 POINT'][i];return card;}if(row.uma)card.append(art(row.uma));else card.append(make('span','?','no-art'));const info=make('div',null,'finish-info'),points=make('div','+'+row.points,'finish-points');points.append(make('small','POINTS'));info.append(make('span',['1ST PLACE','2ND PLACE','3RD PLACE'][row.rank-1],'finish-rank'),make('h3',row.playerName),make('div',row.team,'finish-team'),make('div',row.uma?`${row.uma.name} (${row.uma.outfit})`:'Uma not recorded','finish-uma'),points);card.append(info);return card;}));
  $('format').textContent=s?.manualOverride?'RACE COLUMNS SHOW RECORDED PROGRESSION':'FIRST TO 25 · 4 / 2 / 1';
 }
}
function sample(catalog){const ids=[100601,100701,100201,100301,103001,100602,106801,100901,101301,100101],names=['Fizzle','Flyingsparkz','Reeces Puffs','JeryDream','Kitasan','Starlight','WildCard','Velvet','SilverLine','Daybreak'];const teams=['Dominant H','Team Eclipse'].map((name,i)=>({id:'preview-'+i,name,representative:i===0?catalog.find(c=>c.card===106401):null,points:[14,7][i],players:Array.from({length:5},(_,j)=>({id:`p${i*5+j}`,name:names[i*5+j],uma:catalog.find(c=>c.card===ids[i*5+j])}))}));const splits=[[4,3],[6,1],[4,3]],running=[0,0];const columns=Array.from({length:7},(_,i)=>{if(i<3)running.forEach((_,n)=>running[n]+=splits[i][n]);return {number:i+1,played:i<3,points:i<3?Object.fromEntries(teams.map((t,n)=>[t.id,splits[i][n]])):null,cumulative:i<3?Object.fromEntries(teams.map((t,n)=>[t.id,running[n]])):null};});return {tournament:'DOMINATOR DRAFT TOURNAMENT 2',heat:{number:4,trackName:'Tokyo · 2400 m · Turf'},series:{teams,stage:'QUARTERFINAL',round:'ROUND 1',status:'in-progress'},columns,previous:{number:3,podium:[0,5,6].map((p,i)=>({rank:i+1,points:[4,2,1][i],playerName:names[p],team:teams[p>=5?1:0].name,uma:catalog.find(c=>c.card===ids[p])}))}};}
let sampleData;
async function poll(){try{if(demo){if(!sampleData){const r=await fetch('/api/ops/uma-catalog');if(!r.ok)throw Error();sampleData=sample(await r.json());}show(sampleData);}else{const r=await fetch('/api/broadcast',{cache:'no-store',signal:AbortSignal.timeout(1800)});if(!r.ok)throw Error();show(await r.json());}$('offline').hidden=true;}catch{$('offline').hidden=false;}setTimeout(poll,1200);}
show({});poll();
