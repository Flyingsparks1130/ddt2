import {digest,requireThat,text,id,heatFor} from './domain.mjs';
const stamp=()=>new Date().toISOString();
export function matchLineup(state,match){
 const lineup={};
 // Old desks saved selections separately on each race. Retain the first known outfit per player.
 if(match.lineup)Object.assign(lineup,match.lineup);
 else for(const heat of match.heats){
  for(const [player,card] of Object.entries(heat.lineup||{}))if(card)lineup[player]??=card;
 }
 // A confirmed capture identifies the actual outfit, including when the desk had no selection.
 const recorded={};
 const results=state.races.filter(r=>r.status==='approved'&&r.approval.result.match.id===match.id)
  .map(r=>r.approval.result).sort((a,b)=>a.heat.number-b.heat.number);
 for(const result of results){
  for(const row of result.rows)if(row.playerId&&row.card)recorded[row.playerId]??=row.card;
 }
 return {...lineup,...recorded};
}
export function resetMatch(state,match){
 match.lineup=matchLineup(state,match);
 const heats=new Set(match.heats.map(h=>h.id));
 for(const race of state.races){
  if(!heats.has(race.heatId))continue;
  if(race.approval){
   (race.previousApprovals||=[]).push(race.approval);
   delete race.approval;
  }
  if(race.status==='approved')race.status='pending';
  race.heatId=null;
  race.mapping={};
 }
 for(const record of [...(state.manualHeats||[]),...(state.corrections||[])]){
  if(record.matchId===match.id && ['approved','pending'].includes(record.status))record.status='reset';
 }
 if(heats.has(state.armedHeatId))state.armedHeatId=null;
 if(heats.has(state.activeHeatId))state.activeHeatId=match.heats[0]?.id||null;
 if(state.highlight && state.races.some(r=>r.id===state.highlight.raceId&&!r.heatId))state.highlight=null;
 delete match.spotlightChoice;
 delete match.deskDeletedAt;
}
export function needsMatchRecovery(state){
 return state.matches.some(m=>m.deskDeletedAt || (state.tournament.id==='ddt2'&&!m.siteMatchId));
}
export function recoverMatches(state){
 for(const match of [...state.matches]){
  const local=state.tournament.id==='ddt2'&&!match.siteMatchId;
  if(!local&&!match.deskDeletedAt)continue;
  resetMatch(state,match);
  if(local){
   (state.retiredMatches||=[]).push(match);
   state.matches=state.matches.filter(m=>m!==match);
   if(match.heats.some(h=>h.id===state.activeHeatId))state.activeHeatId=null;
  }
  state.audit.push({at:stamp(),action:local?'match.retired':'match.restored',detail:{matchId:match.id,name:match.name}});
 }
}
export function seriesRows(state,match){
 const automatic=state.races.filter(r=>r.status==='approved'&&r.approval.result.match.id===match.id).map(r=>({id:r.id,heatId:r.heatId,number:r.approval.result.heat.number,manual:false,rows:r.approval.result.rows}));
 const manual=(state.manualHeats||[]).filter(r=>r.status==='approved'&&r.matchId===match.id).map(r=>({id:r.id,heatId:r.heatId,number:heatFor(state,r.heatId).heat.number,manual:true,rows:r.rows,reason:r.reason,operator:r.approval.operator,approvedAt:r.approval.at}));
 return [...automatic,...manual].sort((a,b)=>a.number-b.number);
}
export function seriesSummary(state,match){
 const races=seriesRows(state,match),teams=(match.teamIds||[]).map(tid=>{const t=state.tournament.teams?.find(t=>t.id===tid);return {id:tid,name:t?.name||tid,players:state.tournament.players.filter(p=>match.playerIds.includes(p.id)&&p.teamId===tid).map(p=>({id:p.id,name:p.name,gameName:p.gameName})),points:0};});
 for(const race of races)for(const row of race.rows){const team=teams.find(t=>t.id===row.teamId||t.name===row.team);if(team)team.points+=row.points;}
 const automaticScores=Object.fromEntries(teams.map(t=>[t.id,t.points]));
 const corrections=(state.corrections||[]).filter(c=>c.matchId===match.id&&c.status==='approved');
 const mode=[...corrections].reverse().find(c=>c.kind==='score'||c.kind==='automatic');
 const manual=mode?.kind==='score'?mode:null;
 if(manual)for(const team of teams)team.points=manual.scores[team.id];
 const scoreKey=JSON.stringify({scores:teams.map(t=>[t.id,t.points]),races:races.map(r=>r.id),manual:manual?.id||null});
 const latestDecision=[...corrections].reverse().find(c=>c.kind==='outcome'||c.kind==='reopen');
 const decision=latestDecision?.kind==='outcome'&&latestDecision.scoreKey===scoreKey&&teams.some(t=>t.id===latestDecision.winnerId&&t.points>=(state.tournament.seriesFormat?.target||25))?latestDecision:null;
 const target=state.tournament.seriesFormat?.target||25,leader=teams.find(t=>t.points>=target);
 const consecutive=races.every((r,i)=>r.number===i+1);
 const status=decision?'confirmed':latestDecision?.kind==='outcome'?'outcome-needs-review':manual?'manual-score':leader?'awaiting-confirmation':races.length===6?'tiebreaker-required':races.length?'in-progress':'not-started';
 return {id:match.id,siteMatchId:match.siteMatchId||null,siteRoundId:match.siteRoundId||null,name:match.name,round:match.round,stage:match.stage,teams,automaticScores,races: races.map(({rows,...r})=>({...r,rows:r.manual?rows:undefined})),raceCount:races.length,target,standardRaces:6,maxRaces:7,scoreKey,status,leaderId:leader?.id||null,consecutive,winnerId:decision?.winnerId||null,manualOverride:manual,decision,canRace:!decision&&!leader&&races.length<7};
}
export function allSeries(state){return state.matches.filter(m=>m.teamIds?.length===2).map(m=>seriesSummary(state,m));}
export function checkSeriesRace(state,race,problems){
 const {match,heat}=heatFor(state,race.heatId);if(!match.teamIds?.length)return;
 const summary=seriesSummary(state,match);
 const editing=summary.races.some(r=>r.id===race.id&&r.heatId===race.heatId);
 if(!editing&&summary.winnerId)problems.push('This series is confirmed. Approve a reopen correction before adding a race.');
 if(!editing&&(summary.leaderId))problems.push('A team has reached 25. Confirm the outcome or correct the scores before adding a race.');
 if(!editing&&(summary.races.some(r=>r.heatId===race.heatId)))problems.push('This race slot already has an approved result. Void it before a replacement.');
 if(!editing&&(heat.number!==summary.raceCount+1||!summary.consecutive))problems.push('Approve races in order within the series.');
 if(race.runners&&race.runners.length!==10)problems.push('DDT2 needs ten runners, one per registered player.');
 if(race.runners){const mapped=race.runners.map(r=>race.mapping?.[r.index]||state.tournament.players.find(p=>p.gameName&&p.gameName===r.trainer&&match.playerIds.includes(p.id))?.id);if(new Set(mapped.filter(Boolean)).size!==10)problems.push('Assign each of the ten runners to a different registered player.');}
 const expected=heat.expected||{};
 if(race.track)for(const [key,actual] of [['distance',race.track.distance],['surface',race.track.surface],['trackId',race.track.id]])if(expected[key]&&expected[key]!==actual)problems.push(`Race ${heat.number} does not match its drafted ${key}.`);
}
export function draftCorrection(state,body){
 const match=state.matches.find(m=>m.id===body.matchId);requireThat(match?.teamIds?.length===2,'Choose a two-team series.');
 const kind=body.kind;requireThat(['score','automatic','outcome','reopen'].includes(kind),'Unknown correction type.');
 const summary=seriesSummary(state,match);const correction={id:id(),matchId:match.id,kind,status:'pending',reason:text(body.reason,'Correction reason',500),createdAt:stamp(),baseKey:summary.scoreKey};
 if(kind==='score'){requireThat(body.scores&&Object.keys(body.scores).length===2,'Enter both team scores.');correction.scores={};for(const tid of match.teamIds){const n=body.scores[tid];requireThat(Number.isSafeInteger(n)&&n>=0&&n<=10000,'Manual points must be whole numbers between 0 and 10000.');correction.scores[tid]=n;}}
 if(kind==='outcome'){requireThat(match.teamIds.includes(body.winnerId),'Choose one of the teams as the confirmed winner.');requireThat(summary.teams.some(t=>t.id===body.winnerId&&t.points>=summary.target),'The winning team must reach '+summary.target+' points before finalization.');
 correction.winnerId=body.winnerId;correction.scoreKey=summary.scoreKey;}
 (state.corrections||=[]).push(correction);return correction;
}
export function correctionReview(state,correction){return {correction,hash:digest({correction,revision:state.revision}),current:seriesSummary(state,state.matches.find(m=>m.id===correction.matchId))};}
export function approveCorrection(state,body){const c=state.corrections?.find(c=>c.id===body.correctionId);requireThat(c?.status==='pending','Choose a pending correction.');const review=correctionReview(state,c);requireThat(body.reviewHash===review.hash&&c.baseKey===review.current.scoreKey,'Scores changed. Discard and review a new correction.',409);requireThat(body.confirm===true,'Confirm the correction after checking both teams.');c.status='approved';c.approval={operator:text(body.operator,'Approving operator',80),at:stamp()};return c;}
export function draftManualHeat(state,body){
 const {match,heat}=heatFor(state,body.heatId);requireThat(match.teamIds?.length===2,'Select a DDT2 series race.');requireThat(Array.isArray(body.podium)&&body.podium.length===3&&new Set(body.podium).size===3&&body.podium.every(pid=>match.playerIds.includes(pid)),'Select three different registered finishers.');
 const prior=body.replaces?state.manualHeats?.find(r=>r.id===body.replaces&&r.status==='approved'&&r.heatId===heat.id):null;
 requireThat(!body.replaces||prior,'This podium has changed. Open it again.',409);
 const manual={id:id(),...(prior?{replaces:prior.id,previousHash:digest(prior)}:{}),matchId:match.id,heatId:heat.id,status:'pending',reason:text(body.reason,'Manual result reason',500),trackName:String(body.trackName||'').trim().slice(0,120),rows:body.podium.map((pid,i)=>{const p=state.tournament.players.find(p=>p.id===pid);return {rank:i+1,playerId:p.id,playerName:p.name,teamId:p.teamId,team:p.team,points:[4,2,1][i]};}),createdAt:stamp()};(state.manualHeats||=[]).push(manual);return manual;
}
export function manualReview(state,manual){const problems=[];checkSeriesRace(state,{heatId:manual.heatId,id:manual.replaces},problems);if(manual.replaces&&digest(state.manualHeats.find(r=>r.id===manual.replaces)||null)!==manual.previousHash)problems.push('Podium changed. Review the latest version.');return {manual,problems,hash:digest({manual,revision:state.revision})};}
export function approveManual(state,body){const m=state.manualHeats?.find(m=>m.id===body.manualId);requireThat(m?.status==='pending','Choose a pending manual result.');const review=manualReview(state,m);requireThat(body.reviewHash===review.hash,'Manual result changed. Review it again.',409);requireThat(review.problems.length===0,review.problems.join(' '));requireThat(body.broadcastFinished===true,'Confirm that this race has finished on the broadcast.');m.status='approved';m.approval={operator:text(body.operator,'Approving operator',80),at:stamp()};if(m.replaces){
  const previous=state.manualHeats.find(r=>r.id===m.replaces);
  Object.assign(previous,{rows:m.rows,reason:m.reason,trackName:m.trackName,approval:m.approval});
  m.status='applied';return previous;
 }return m;}
