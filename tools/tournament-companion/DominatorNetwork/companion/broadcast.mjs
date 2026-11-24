import {heatFor,requireThat} from './domain.mjs';
import {matchLineup,seriesRows,seriesSummary} from './series.mjs';
import {representativeCard} from './ddt2.mjs';
import catalog from '../assets/uma-catalog.json' with {type:'json'};

export const umaCatalog=catalog;
const cards=new Map(catalog.map(c=>[c.card,c]));
export function umaFor(card,name='') {
 const found=cards.get(Number(card));
 return found?{...found,name:found.name||name}:Number(card)>0?{card:Number(card),name:name||'Uma',outfit:'',art:null}:null;
}
export function saveLineup(state,body) {
 const match=body.matchId?state.matches.find(m=>m.id===body.matchId):heatFor(state,body.heatId).match;
 requireThat(match?.teamIds?.length===2,'Choose a team matchup first.');
 requireThat(Array.isArray(body.entries)&&body.entries.length===match.playerIds.length,'Provide one lineup choice for each player.');
 const existing=matchLineup(state,match),seen=new Set();
 const disqualified=new Set(match.disqualifiedPlayerIds||[]);
 for(const entry of body.entries){
  requireThat(match.playerIds.includes(entry.playerId)&&!seen.has(entry.playerId),'Choose each registered player exactly once.');
  seen.add(entry.playerId);
  if(entry.disqualified!==undefined){
   requireThat(typeof entry.disqualified==='boolean','Choose a valid DQ status.');
   if(entry.disqualified)disqualified.add(entry.playerId);
   else disqualified.delete(entry.playerId);
  }
  requireThat(entry.card===null||cards.has(entry.card)||(entry.card>0&&entry.card===existing[entry.playerId]),'Choose an exact Uma outfit from the list.');
 }
 const next=Object.fromEntries(body.entries.filter(e=>e.card!==null).map(e=>[e.playerId,e.card]));
 if(seriesRows(state,match).length){
  for(const [id,card] of Object.entries(existing)){
   requireThat(next[id]===card,'A race is already approved. Keep its confirmed lineup.');
  }
 }
 match.lineup=next;
 match.disqualifiedPlayerIds=[...disqualified];
 for(const heat of match.heats)delete heat.lineup;
 return {matchId:match.id,heatId:body.heatId,count:Object.keys(next).length};
}
export function broadcastState(state,config,connected=false) {
 const active=state.activeHeatId?heatFor(state,state.activeHeatId):null;
 const base={tournament:state.tournament.name,config,connected,heat:active?.heat||null,series:null};
 if(!active?.match.teamIds?.length)return base;
 const {match,heat}=active,summary=seriesSummary(state,match),races=seriesRows(state,match);
 const lineup=matchLineup(state,match);
 const recorded=races.find(r=>r.heatId===heat.id);
 const teams=summary.teams.map(team=>({...team,
  representative:umaFor(representativeCard(state.tournament.teams.find(t=>t.id===team.id)||team,state.tournament.id)),
  players:team.players.map(player=>{
  const row=recorded?.rows.find(r=>r.playerId===player.id);
  const card=lineup[player.id];
  return {...player,disqualified:match.disqualifiedPlayerIds?.includes(player.id)===true,uma:umaFor(card,row?.name),lineupSource:row?.card?'approved':card?'selected':'unknown'};
 })}));
 const running=Object.fromEntries(teams.map(t=>[t.id,0]));
 const columns=Array.from({length:7},(_,i)=>{
  const race=races.find(r=>r.number===i+1);
  const points=Object.fromEntries(teams.map(t=>[t.id,0]));
  if(race)for(const row of race.rows){const team=teams.find(t=>t.id===row.teamId||t.name===row.team);if(team)points[team.id]+=row.points;}
  if(race)for(const team of teams)running[team.id]+=points[team.id];
  return {number:i+1,label:i===6?'TB':`RACE ${i+1}`,played:!!race,manual:!!race?.manual,points:race?points:null,cumulative:race?{...running}:null};
 });
 const last=races.at(-1);
 const previous=last?{number:last.number,manual:last.manual,podium:last.rows.filter(r=>r.rank>=1&&r.rank<=3).sort((a,b)=>a.rank-b.rank).map(row=>{
  const team=teams.find(t=>t.id===row.teamId||t.name===row.team);
  return {rank:row.rank,playerId:row.playerId,playerName:row.playerName,teamId:team?.id,team:team?.name,points:row.points,uma:umaFor(row.card||lineup[row.playerId],row.name)};
 })}:null;
 return {...base,series:{...summary,teams},columns,previous};
}
