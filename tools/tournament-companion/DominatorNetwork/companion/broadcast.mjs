import {heatFor,requireThat} from './domain.mjs';
import {seriesRows,seriesSummary} from './series.mjs';
import catalog from '../assets/uma-catalog.json' with {type:'json'};

export const umaCatalog=catalog;
const cards=new Map(catalog.map(c=>[c.card,c]));
export function umaFor(card,name='') {
 const found=cards.get(Number(card));
 return found?{...found,name:found.name||name}:Number(card)>0?{card:Number(card),name:name||'Uma',outfit:'',art:null}:null;
}
export function saveLineup(state,body) {
 const {match,heat}=heatFor(state,body.heatId);
 requireThat(match.teamIds?.length===2,'Choose a team matchup first.');
 requireThat(!seriesRows(state,match).some(r=>r.heatId===heat.id),'This race is already approved. Its recorded lineup is kept with the result.');
 requireThat(Array.isArray(body.entries)&&body.entries.length===match.playerIds.length,'Provide one lineup choice for each player.');
 const seen=new Set();
 for(const entry of body.entries){
  requireThat(match.playerIds.includes(entry.playerId)&&!seen.has(entry.playerId),'Choose each registered player exactly once.');
  seen.add(entry.playerId);
  requireThat(entry.card===null||cards.has(entry.card),'Choose an exact Uma outfit from the list.');
 }
 heat.lineup=Object.fromEntries(body.entries.filter(e=>e.card!==null).map(e=>[e.playerId,e.card]));
 return {heatId:heat.id,count:Object.keys(heat.lineup).length};
}
export function broadcastState(state,config,connected=false) {
 const active=state.activeHeatId?heatFor(state,state.activeHeatId):null;
 const base={tournament:state.tournament.name,config,connected,heat:active?.heat||null,series:null};
 if(!active?.match.teamIds?.length)return base;
 const {match,heat}=active,summary=seriesSummary(state,match),races=seriesRows(state,match);
 const recorded=races.find(r=>r.heatId===heat.id);
 const teams=summary.teams.map(team=>({...team,players:team.players.map(player=>{
  const row=recorded?.rows.find(r=>r.playerId===player.id);
  const card=row?.card||heat.lineup?.[player.id];
  return {...player,uma:umaFor(card,row?.name),lineupSource:row?.card?'approved':card?'selected':'unknown'};
 })}));
 const running=Object.fromEntries(teams.map(t=>[t.id,0]));
 const columns=Array.from({length:7},(_,i)=>{
  const race=races.find(r=>r.number===i+1);
  const points=Object.fromEntries(teams.map(t=>[t.id,0]));
  if(race)for(const row of race.rows){const team=teams.find(t=>t.id===row.teamId||t.name===row.team);if(team)points[team.id]+=row.points;}
  if(race)for(const team of teams)running[team.id]+=points[team.id];
  return {number:i+1,label:i===6?'TB':`RACE ${i+1}`,played:!!race,manual:!!race?.manual,points:race?points:null,cumulative:race?{...running}:null};
 });
 const last=races.at(-1),lastHeat=last?match.heats.find(h=>h.id===last.heatId):null;
 const previous=last?{number:last.number,manual:last.manual,podium:last.rows.filter(r=>r.rank>=1&&r.rank<=3).sort((a,b)=>a.rank-b.rank).map(row=>{
  const team=teams.find(t=>t.id===row.teamId||t.name===row.team);
  return {rank:row.rank,playerId:row.playerId,playerName:row.playerName,teamId:team?.id,team:team?.name,points:row.points,uma:umaFor(row.card||lastHeat?.lineup?.[row.playerId],row.name)};
 })}:null;
 return {...base,series:{...summary,teams},columns,previous};
}
