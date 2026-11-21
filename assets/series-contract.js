/* DDT2 approved series extension. Race standings retain their original meaning. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DDT2SeriesContract=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';const ensure=(ok,message)=>{if(!ok)throw Error(message);};
 const str=(s,empty=false)=>typeof s==='string'&&(empty||s.trim())&&s.length<=500;
 const points=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
 function approval(v){ensure(v&&str(v.reason)&&v.status==='approved'&&str(v.approval?.operator)&&Number.isFinite(Date.parse(v.approval.at)),'Manual changes require an operator, reason and approval.');}
 function validate(bundle){
  const series=bundle.series;ensure(series?.schema==='ddt2-series/v1'&&bundle.tournament.id==='ddt2','Unsupported series extension.');
  ensure(Array.isArray(series.matches)&&series.matches.length<=256&&Array.isArray(series.teams)&&series.teams.length<=32,'Invalid series list.');
  const ids=new Set(),siteIds=new Set(),raceIds=new Set(),heatIds=new Set();
  for(const m of series.matches){ensure(str(m.id)&&!ids.has(m.id),'Duplicate or missing series ID.');ids.add(m.id);ensure(str(m.name)&&str(m.round,true)&&str(m.stage,true),'Invalid series labels.');
   if(m.siteMatchId){ensure(/^[\w-]{1,80}$/.test(m.siteMatchId)&&str(m.siteRoundId)&&!siteIds.has(m.siteMatchId),'Invalid or duplicate bracket link.');siteIds.add(m.siteMatchId);}
   ensure(m.target===25&&m.standardRaces===6&&m.maxRaces===7,'Unsupported DDT2 series format.');
   ensure(Array.isArray(m.teams)&&m.teams.length===2&&m.teams[0].id!==m.teams[1].id,'A series needs two different teams.');
   const players=new Map(),scores={};for(const t of m.teams){ensure(series.teams.some(x=>x.id===t.id&&x.name===t.name)&&points(t.points)&&Array.isArray(t.players)&&t.players.length===5,'Invalid series team.');scores[t.id]=0;for(const p of t.players){ensure(str(p.id)&&str(p.name)&&!players.has(p.id),'Duplicate series participant.');players.set(p.id,t.id);}}
   ensure(Array.isArray(m.races)&&m.races.length<=7&&m.raceCount===m.races.length,'Invalid race count.');const numbers=new Set();
   for(const r of m.races){ensure(str(r.id)&&str(r.heatId)&&!raceIds.has(r.id)&&!heatIds.has(r.heatId)&&Number.isInteger(r.number)&&r.number>=1&&r.number<=7&&!numbers.has(r.number),'Duplicate or invalid series race.');raceIds.add(r.id);heatIds.add(r.heatId);numbers.add(r.number);let rows;
    if(r.manual===true){ensure(str(r.reason)&&str(r.operator)&&Number.isFinite(Date.parse(r.approvedAt))&&Array.isArray(r.rows)&&r.rows.length===3,'Manual podium requires approval.');rows=r.rows;ensure(rows.every((p,i)=>p.rank===i+1&&p.points===[4,2,1][i])&&new Set(rows.map(p=>p.playerId)).size===3,'Invalid manual podium.');ensure(!bundle.results.some(x=>x.raceId===r.id||x.heat.id===r.heatId),'A race cannot count as both manual and recorded.');}
    else{ensure(r.manual===false,'Invalid race source.');const source=bundle.results.find(x=>x.raceId===r.id&&x.match.id===m.id&&x.heat.id===r.heatId&&x.heat.number===r.number);ensure(source&&source.rows.length===10&&new Set(source.rows.map(p=>p.playerId)).size===10,'Recorded DDT2 race needs ten unique registered players.');ensure(JSON.stringify(source.rules.points)==='[4,2,1]','DDT2 uses 4 / 2 / 1 scoring.');rows=source.rows;}
    for(const row of rows){const teamId=players.get(row.playerId),team=m.teams.find(t=>t.id===teamId);ensure(team&&row.team===team.name&&points(row.points),'Result is assigned to the wrong team.');scores[teamId]+=row.points;}
   }
   for(const t of m.teams)ensure(m.automaticScores?.[t.id]===scores[t.id],'Calculated series score does not match approved races.');
   if(m.manualOverride){approval(m.manualOverride);ensure(m.manualOverride.kind==='score'&&m.manualOverride.matchId===m.id,'Invalid static score override.');for(const t of m.teams)ensure(points(m.manualOverride.scores[t.id])&&t.points===m.manualOverride.scores[t.id],'Static scores do not match their approved override.');}
   else for(const t of m.teams)ensure(t.points===scores[t.id],'Series points do not match calculated points.');
   const key=JSON.stringify({scores:m.teams.map(t=>[t.id,t.points]),races:m.races.map(r=>r.id),manual:m.manualOverride?.id||null});ensure(m.scoreKey===key,'Series score version is inconsistent.');
   if(m.decision){approval(m.decision);ensure(m.decision.kind==='outcome'&&m.decision.matchId===m.id&&m.decision.scoreKey===key&&m.teams.some(t=>t.id===m.decision.winnerId)&&m.winnerId===m.decision.winnerId,'Series outcome does not match the reviewed scores.');}
   else ensure(m.winnerId===null,'A winner requires explicit operator approval.');
  }
  for(const result of bundle.results)ensure(raceIds.has(result.raceId),'An approved DDT2 race is missing from its series.');return series;
 }
 function apply(index,bundle){validate(bundle);const result=JSON.parse(JSON.stringify(index));for(const s of bundle.series.matches){if(!s.siteMatchId)continue;const m=result.matches.find(m=>m.id===s.siteMatchId&&m.round===s.siteRoundId);if(!m)continue;const teamIds=(m.participants||[]).filter(Boolean).map(t=>t.id);if(teamIds.length!==2||!s.teams.every(t=>teamIds.includes(t.id)))continue;
   /* Existing organizer decisions are not overwritten by another input source. */
   const officialScores=m.scores||{},hasOfficialScores=Object.values(officialScores).some(n=>Number(n)!==0);
   if((m.winner_id&&m.winner_id!==s.winnerId)||(hasOfficialScores&&s.teams.some(t=>Number(officialScores[t.id]||0)!==t.points))||(m.reported_results?.races?.length)){m.companion_conflict=true;continue;}
   m.scores=Object.fromEntries(s.teams.map(t=>[t.id,t.points]));m.companion_series=s;m.winner_id=s.winnerId;m.loser_id=s.winnerId?s.teams.find(t=>t.id!==s.winnerId).id:null;
   const recorded=bundle.results.filter(r=>r.match.id===s.id);m.reported_results={...(m.reported_results||{}),races:s.races.map(r=>{if(r.manual)return {number:r.number,track:'Manually verified podium',source:'manual',podium:r.rows.map(p=>({place:p.rank,points:p.points,display_name:p.playerName,team_id:p.teamId,uma:'Not supplied'}))};const race=recorded.find(x=>x.raceId===r.id);return {number:r.number,track:race.track.name||`${race.track.distance} m`,source:'horseACT',podium:race.rows.filter(p=>p.rank<=3).map(p=>({place:p.rank,points:p.points,display_name:p.playerName,team_id:p.teamId,uma:p.name,card_id:p.card}))};})};
  }return result;
 }
 return {validate,apply};
});
