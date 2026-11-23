(function(global,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./companion-contract.js'),require('./series-contract.js'));
 else global.DDT2Package=factory(global.CompanionContract,global.DDT2SeriesContract);
})(globalThis,function(contract,series){
 function merge(index,existing,incoming){
  contract.validate(incoming,'ddt2');
  if(incoming.series?.matches.length!==1)throw Error('Choose a ZIP containing one bracket match.');
  const match=incoming.series.matches[0];
  if(!match.siteMatchId||(!match.raceCount&&!match.decision&&!match.manualOverride))throw Error('No approved match data.');
  if(existing)contract.validate(existing,'ddt2');
  for(const [id,b] of Object.entries(match.builds||{})){
   if(!match.teams.some(t=>t.players.some(p=>p.id===id))||!b||!Array.isArray(b.skills)||!Array.isArray(b.support)||b.skills.length>300||b.support.length>20||!b.stats||!b.aptitudes)throw Error('Invalid recorded build.');
  }
  const previous=existing?.series?.matches.find(m=>m.siteMatchId===match.siteMatchId);
  if(previous){
   if(previous.id!==match.id||previous.races.some(old=>!match.races.some(r=>r.id===old.id&&r.number===old.number)))throw Error('This ZIP would replace or remove an already published race.');
   if(previous.winnerId&&previous.winnerId!==match.winnerId)throw Error('This ZIP conflicts with a published winner.');
  }
  const results=[...(existing?.results||[]).filter(r=>r.match.id!==match.id),...incoming.results].sort((a,b)=>a.match.id.localeCompare(b.match.id)||a.heat.number-b.heat.number);
  const matches=[...(existing?.series.matches||[]).filter(m=>m.siteMatchId!==match.siteMatchId),match].sort((a,b)=>a.id.localeCompare(b.id));
  const standings={players:contract.standings(results,'players',incoming.tournament.scoring.tiebreak),teams:contract.standings(results,'teams',incoming.tournament.scoring.tiebreak)};
  const bundle={...incoming,results,standings,voided:existing?.voided||[],series:{...incoming.series,matches}};
  contract.validate(bundle,'ddt2');
  const projected=series.apply(index,bundle),fixture=projected.matches.find(m=>m.id===match.siteMatchId);
  if(!fixture?.companion_series||projected.matches.some(m=>m.companion_conflict))throw Error('The result conflicts with the official bracket.');
  for(const team of match.teams){const official=index.teams.find(t=>t.id===team.id);
   if(!official||official.name!==team.name||team.players.some(p=>!official.members.some(m=>m.display_name===p.name)))throw Error('The team or player list differs from the tournament roster.');}
  return {bundle,fixture,slots:Object.fromEntries(projected.matches.map(m=>[m.id,m.participants.map(t=>t?.id||null)]))};
 }
 return {merge};
});
