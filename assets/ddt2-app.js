/* DDT2's public interface. All competition views use the current event index. */
(function(global){
 'use strict';
 const Guide=global.DDT2Guide||(typeof require==='function'?require('./ddt2-guide.js'):null);
 const Matchday=global.DDT2Matchday||(typeof require==='function'?require('./ddt2-matchday.js'):null);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={bracket:'<path d="M5 5h9v9H5zM5 26h9v9H5zM27 15h9v9h-9zM14 9h6v20h-6M20 20h7"/>',clubs:'<path d="M20 3 35 9v11c0 9-15 17-15 17S5 29 5 20V9Z"/><path d="m12 14 4 5 4-9 4 9 4-5-2 12H14Z"/>',stats:'<path d="M5 35h31M9 28V18M20 28V6M31 28V12"/>',drafts:'<path d="M7 5h26v31H7Z M13 13h14M13 20h14M13 27h8"/>'};
 const matchLabel=id=>String(id).replace(/^r([1-4])-m(\d+)$/i,(_,round,slot)=>['Round 1','Round 2 / Quarterfinals','Semifinals','Grand Final'][Number(round)-1]+' · Match '+slot);
 const icon=k=>`<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${icons[k]||icons.bracket}</svg>`;
 const state=(type,title,description)=>`<div class="season-empty">${icon(type)}<h2>${title}</h2><p>${description}</p></div>`;
 const head=(title,description='')=>`<section class="season-heading"><h1 tabindex="-1">${title}</h1>${description?`<p>${description}</p>`:''}</section>`;
 const metric=(value,label,note='')=>`<div class="season-metric"><strong>${esc(value)}</strong><span>${label}</span>${note?`<small>${note}</small>`:''}</div>`;
 const startDate=event=>event.start_date?new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(event.start_date)):'';
 const shortDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
 function status(m,roundSchedule,view){
  if(m.status!=='ready' && m.status!=='awaiting_opponent'){
   return {complete:'Final',forfeit:'Forfeit',in_progress:'In progress',needs_review:'Under review'}[m.status]||'Pending';
  }
  const date=roundSchedule?.[m.round]?.[view==='draft'?'draft':'races'];
  return date?`<time datetime="${esc(date)}">${shortDate.format(new Date(date))}</time>`:'TBD';
 }
 const matchURL=(m,view='results')=>`archive.html?${new URLSearchParams({round:m.round,match:m.id,view})}`;
 const lineup=m=>(m.lineup?.length?m.lineup:m.draft_lineup?.length?m.draft_lineup:m.draft?.roster||[]).filter(p=>!p.benched);
 function art(row){return global.UmaRaceArt?global.UmaRaceArt.figure(row):'<span class="uma-art-placeholder" aria-label="Character artwork unavailable">◇</span>';}
 function match(m,view,teamArtwork,roundSchedule){return `<a class="season-match" data-match-id="${esc(m.id)}" href="${esc(matchURL(m,view))}"><div class="season-match-meta"><span>${esc(matchLabel(m.id))}</span><span class="match-status">${status(m,roundSchedule,view)}</span></div><div class="season-match-sides">${(m.participants||[]).map((team,i)=>`<section data-club-id="${esc(team?.id)}" class="${Matchday.outcome(m,team)}"><span class="season-team-label">${team?Matchday.teamCrest(team.id,teamArtwork):''}${esc(team?.name||(m.sources?.[i]?.winner_of?'Winner of '+matchLabel(m.sources[i].winner_of):'To be confirmed'))}${Matchday.winMark(Matchday.outcome(m,team))}</span>${team && m.scores?.[team.id]!=null && (m.winner_id || m.status==='in_progress' || Object.values(m.scores).some(Number))?`<strong class="season-score">${esc(m.scores[team.id])}</strong>`:''}</section>`).join('<span class="season-vs">VS</span>')}</div><div class="season-match-bottom">${view==='draft'?'Match draft':'Match details'} <span>↗</span></div></a>`;}
 function home(d){const prize=d.event.prize;return `<section class="season-home-hero"><div class="season-home-copy"><p class="season-eyebrow">Dominator Network</p><div class="season-title-art" aria-label="DDT2">DDT<span>2</span></div><h1 tabindex="-1">Who Will Dominate?</h1><p class="season-home-description">${d.event.start_date?`Starts <time datetime="${esc(d.event.start_date)}">${startDate(d.event)}</time>`:"Dominator Draft Tournament 2"}</p><div class="season-home-actions"><a class="season-button" href="bracket.html">Tournament bracket <span>↗</span></a><a class="season-text-link" href="teams.html">Participating teams <span>→</span></a></div></div></section>${Matchday.hub(d)}${Guide.invitation()}<section class="season-section"><div class="season-section-top"><h2>Tournament</h2></div><div class="season-entry-grid">${[['bracket','Tournament Bracket','Round structure, matchups and official results.'],['clubs','Participating Teams','Team rosters, selected Umas and submitted builds.'],['stats','Tournament Stats','Team standings, race performance and draft statistics.']].map(([key,title,copy])=>`<a class="season-entry" href="${key==='clubs'?'teams':key}.html">${icon(key)}<h3>${title}</h3><p>${copy}</p><b aria-hidden="true">↗</b></a>`).join('')}</div></section><section class="season-announcements"><div><h2>Announcements</h2><p>${d.event.start_date?`DDT2 begins <time datetime="${esc(d.event.start_date)}">${startDate(d.event)}</time>. Match times will be announced here.`:"Team registration and the match schedule will be announced here."}</p></div><div class="season-prize"><strong>${prize.count}</strong><div><h3>Discord Nitro Prizes</h3><p>Prize allocation will be announced with the tournament rules.</p></div></div></section>`;}
 function bracket(d) {
  const {rounds, matches, teams} = d.index;
  const heading = head('Tournament Bracket',
   rounds.length ? esc(teams.length + ' teams · Single elimination' + (d.event.start_date ? ' · ' + startDate(d.event) : '')) : 'Draw pending');
  if (!rounds.length) return heading + '<div class="season-workspace">' +
   state('bracket', 'Bracket Not Confirmed', 'The draw, rounds and matchups have not been announced.') +
   '</div>';
  const titles = {R1:'Round 1', R2:'Round 2 / Quarterfinals', R3:'Semifinals', R4:'Grand Final'};
  const shortcuts = rounds.map(r => `<a href="#draw-${esc(r.id)}">${esc(r.name || r.id)}</a>`).join('');
  const columns = rounds.map(r => {
   const fixtures = matches.filter(m => m.round === r.id);
   return `<section class="season-bracket-round" id="draw-${esc(r.id)}">
    <header><h2>${esc(titles[r.id] || r.name || r.id)}</h2></header>
    <div class="draw-fixtures">${fixtures.map(m => match(m,undefined,d.event.team_artwork,d.event.round_schedule)).join('') || '<p>No matches scheduled.</p>'}</div>
   </section>`;
  }).join('');
  return heading + `<div class="draw-toolbar">${Matchday.bracketTools(d)}<a class="season-text-link" href="tracks.html">Matches ↗</a></div>
   <nav class="draw-jumps" aria-label="Jump to round">${shortcuts}</nav>
   <div class="season-workspace draw-panel"><div class="season-bracket-scroll" tabindex="0" aria-label="Tournament rounds">
    <div class="matchday-bracket-board"><svg class="matchday-path-lines" aria-hidden="true" preserveAspectRatio="none"></svg>${columns}</div>
   </div></div>`;
 }
 function matchTabs(view,resultsURL,draftURL){
  return `<nav class="match-view-switch" aria-label="Match views"><a href="${esc(resultsURL)}" ${view==='results'?'aria-current="page"':''}>Results</a><a href="${esc(draftURL)}" ${view==='draft'?'aria-current="page"':''}>Drafts</a></nav>`;
 }
 function matches(d){
  const view=d.params.get('view')==='draft'?'draft':'results';
  const tabs=matchTabs(view,'tracks.html','tracks.html?view=draft');
  const cards=d.index.matches.map(m=>match(m,view,d.event.team_artwork,d.event.round_schedule));
  return head('Matches')+tabs+(cards.length?`<div class="season-match-grid">${cards.join('')}</div>`:'<p class="season-no-data">No matches announced.</p>');
 }
 function members(d,id){return d.index.team_rosters?.[id]?.members||d.index.club_rosters?.[id]?.members||[];}
 function record(d,id){const matches=d.index.matches.filter(m=>m.winner_id&&m.participants.some(p=>p?.id===id));return {wins:matches.filter(m=>m.winner_id===id).length,losses:matches.filter(m=>m.loser_id===id).length,points:matches.reduce((n,m)=>n+(m.scores?.[id]||0),0)};}
 function roster(d,id,showLabel=true,query=''){const rows=members(d,id);return `<div class="season-team-roster">${showLabel?'<div class="season-roster-heading"><span>Players</span></div>':''}${rows.length?`<ul>${rows.map(p=>`<li>${highlightTrainer(p.display_name,query)}</li>`).join('')}</ul>`:'<p>Players have not been announced.</p>'}</div>`;}
 function highlightTrainer(name, query) {
  if (!query) return esc(name);
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(name).split(new RegExp('(' + literal + ')', 'gi'))
   .map((part, i) => i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part)).join('');
 }
 function directoryCards(d, query = '') {
  const q = query.trim().toLowerCase();
  const teams = d.index.teams.filter(team => !q || team.name.toLowerCase().includes(q) ||
   members(d, team.id).some(player => player.display_name.toLowerCase().includes(q)));
  const ordered = [...teams.filter(team => team.id === d.favorite), ...teams.filter(team => team.id !== d.favorite)];
  return ordered.map(team => clubCard(d, team, q)).join('') || '<p class="season-no-data">No teams match your search.</p>';
 }
 function clubCard(d,team,query) {
  return `<article class="matchday-club-card">
   <a class="season-club" href="team.html?id=${encodeURIComponent(team.id)}">
    <header><div class="season-crest">${Matchday.teamCrest(team.id,d.event.team_artwork)}</div><h2>${esc(team.name)}</h2><span class="season-club-arrow" aria-hidden="true">↗</span></header>
    ${roster(d,team.id,false,query)}
   </a><div class="matchday-club-actions">${Matchday.followButton(d,team.id)}</div>
  </article>`;
 }
 function clubs(d){return head('Teams')+`<div class="season-toolbar"><p><b>${d.index.teams.length}</b> confirmed teams</p><label class="season-search"><span>Search teams</span><input id="season-club-search" aria-label="Search teams or trainers" type="search" placeholder="Team or player name" ${d.index.teams.length?'':'disabled'}></label></div><div id="season-club-list" class="season-club-grid">${d.index.teams.length?directoryCards(d):`<div class="season-workspace">${state('clubs','Teams to Be Announced','Participating teams and their lineups will be published after registration is confirmed.')}</div>`}</div>`;}
 function teamHeading(d,team) {
  const title=Matchday.teamCrest(team.id,d.event.team_artwork)+esc(team.name);
  const card=d.event.team_artwork?.[team.id]?.card;
  if(!card || !global.UmaRaceArt?.resolve({card_id:card}))return head(title);
  return `<div class="team-art-backdrop" aria-hidden="true">${art({card_id:card})}</div>`+head(title);
 }
 function club(d){const c=d.index.teams.find(c=>c.id===d.params.get('id'));if(!c)return head('Team Details','The requested team is not registered for DDT2.')+`<div class="season-workspace">${state('clubs','Team Not Available','See the current list of confirmed participants.')}<a class="season-empty-link" href="teams.html">View teams →</a></div>`;const r=record(d,c.id);
  const fixtures=d.index.matches.filter(m=>m.participants.some(t=>t?.id===c.id));
  return teamHeading(d,c)
   + `<div class="matchday-club-toolbar"><a class="season-text-link" href="teams.html">← All teams</a>${Matchday.followButton(d,c.id)}<p role="status">${d.followNotice||''}</p></div>
    <div class="profile-grid"><section class="season-section season-team-section profile-roster"><h2>Team Roster</h2>${roster(d,c.id,false)}</section>
    <section class="season-section season-team-section profile-fixtures"><h2>Matches</h2>${fixtures.length?`<div class="season-match-grid">${fixtures.map(m=>match(m,undefined,d.event.team_artwork,d.event.round_schedule)).join('')}</div>`:'<p class="season-no-data">The draw is pending.</p>'}</section>
    <section class="season-section season-team-section profile-lineup"><h2>Uma Lineup</h2>${Matchday.clubLineup(d,c.id)}</section></div>
    ${r.wins+r.losses?`<div class="season-metrics">${metric(r.wins,'Wins')}${metric(r.losses,'Losses')}${metric(r.points,'Points')}</div>`:''}`;
 }
 function rankPanel(title,rows,note,artKind=''){
  function renderRow(row,index){
   let image='';
   if(artKind==='support'&&row.thumbnail){
    const [sheet,column,line]=row.thumbnail;
    image=`<i class="stat-card-art" aria-hidden="true" style="background-image:url(assets/supports/stats-${Number(sheet)}.webp);background-position:${Number(column)*20}% ${Number(line)*100/3}%"></i>`;
   }else if(artKind&&row.image){
    image=`<img class="stat-rank-art" src="${esc(row.image)}" alt="" loading="lazy">`;
   }
   return `<li><span>${row.rank||index+1}</span>${image}<strong>${esc(row.name)}</strong><b>${row.count}</b></li>`;
  }
  return `<article class="season-stat-panel"><header><h2>${title}</h2><p>${note}</p></header>${rows?.length?`<ol class="season-rank-list">${rows.slice(0,10).map(renderRow).join('')}</ol>`:'<div class="season-stat-empty"><span>—</span><p>No data recorded</p></div>'}</article>`;
 }
 function stats(d){const s=d.stats?.statistics||{},c=s.coverage||{},i=d.index;const teams=i.teams.map(t=>({...t,...record(d,t.id)})).sort((a,b)=>b.wins-a.wins||b.points-a.points||a.name.localeCompare(b.name));return head('Tournament Stats','Official results and statistics for DDT2.')+`<div class="season-metrics">${metric(i.matches.filter(m=>m.winner_id).length,'Completed matches')}${metric(c.reported_races||0,'Recorded races')}${metric(c.builds||0,'Submitted builds')}${metric(c.starts||0,'Verified starts')}</div><nav class="season-stat-nav" aria-label="Statistics sections"><a href="#standings">Team standings</a><a href="#race-stats">Race & draft data</a><a href="#build-stats">Build statistics</a></nav><section class="season-stat-panel" id="standings"><header><div><p class="season-eyebrow">Results</p><h2>Team Standings</h2></div><span class="season-pill">${teams.length?'Current event':'Awaiting participants'}</span></header><div class="season-table-wrap"><table><thead><tr><th scope="col">Team</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">Points</th></tr></thead><tbody>${teams.length?teams.map(t=>`<tr><th scope="row"><a href="team.html?id=${encodeURIComponent(t.id)}">${Matchday.teamCrest(t.id,d.event.team_artwork)}${esc(t.name)}</a></th><td>${t.wins+t.losses}</td><td>${t.wins}</td><td>${t.losses}</td><td>${t.points}</td></tr>`).join(''):'<tr><td colspan="5" class="season-table-empty">Standings will appear after teams are registered and results are confirmed.</td></tr>'}</tbody></table></div></section><div class="season-stat-grid" id="race-stats">${rankPanel('Umas Ran',s.umas_ran,'Matchups run by each Uma. All outfits count together.','uma')}${rankPanel('Support Cards',s.support,'Builds using each support card.','support')}${rankPanel('Uma Selections',s.fielded,'Fielded Umas recorded in match lineups.')}${rankPanel('Track Selections',s.track_picks,'Recorded track picks from match drafts.')}${rankPanel('Uma Bans',s.veto,'Opponent bans recorded during the draft.')}</div><section class="season-stat-panel" id="build-stats"><header><h2>Build Statistics</h2><p>Median base stats across verified submitted builds.</p></header><div class="season-build-stats">${[['speed','Speed'],['stamina','Stamina'],['power','Power'],['guts','Guts'],['wisdom','Wit']].map(([k,n])=>`<div><span>${n}</span><strong>${s.distributions?.[k]?.n?Math.round(s.distributions[k].median):'—'}</strong><small>${s.distributions?.[k]?.n?s.distributions[k].n+' builds':'No data'}</small></div>`).join('')}</div></section><p class="season-data-note">Statistics are based on confirmed DDT2 results and submitted builds. Missing data is shown as —.</p>`;}
 function rules(d){return head('Tournament Rules','Draft format, build requirements and match scoring.')+`
  ${d.event.start_date?`<p class="season-home-description">Tournament starts <time datetime="${esc(d.event.start_date)}">${startDate(d.event)}</time>.</p>`:''}
  <div class="season-rules-grid"><section class="season-stat-panel"><header><h2>What Is a Draft?</h2></header><p>Two teams of five trainers race on six tracks chosen during the draft. Each trainer enters one Uma from their team’s picks and uses the same build throughout the match.</p><a class="season-text-link" href="#draft-process">Draft process ↓</a></section><section class="season-stat-panel season-rules-prize"><p class="season-eyebrow">Prize pool</p><strong>${d.event.prize.count}</strong><h2>Discord Nitro Prizes</h2><p>Prize allocation will be announced separately.</p></section></div>
  ${Guide.walkthrough()}
  <div class="season-rules-grid season-section"><section class="season-stat-panel"><header><h2>Match Scoring</h2></header><p>The top three finishers in each race earn points for their team.</p><div class="matchday-points"><div><span>1st place</span><strong>4</strong><small>points</small></div><div><span>2nd place</span><strong>2</strong><small>points</small></div><div><span>3rd place</span><strong>1</strong><small>point</small></div></div><p>Each match lasts <strong>4–7 races</strong>. The first team to reach <strong>25 points</strong> wins, and the match ends immediately. A team can reach 25 as early as the fourth race.</p><p>If neither team reaches 25 after six races, they run a seventh race on the tiebreaker track drawn at the start of the draft. The tiebreaker uses the same 4/2/1 scoring.</p></section><section class="season-stat-panel"><header><h2>Build Requirements</h2></header><ul class="matchday-requirements"><li>Each trainer must submit exactly one Uma from their team’s final lineup.</li><li>All builds must be trained in <strong>Unity Cup</strong>.</li><li>Training and submission must be completed within the 24-hour window.</li><li>The same submitted build must be used for every race, including the tiebreaker.</li></ul></section></div>${Guide.scoring()}`;}

 function results(m){
  const races=m.reported_results?.races||[];
  const cards=races.map(r=>{
   const podium=[...(r.podium||[])].sort((a,b)=>a.place-b.place);
   const detailURL=m.companion_series && r.source==='horseACT'
    ? 'companion.html?'+new URLSearchParams({match:m.companion_series.id,race:r.number})+'#race-results' : null;
   return `<details class="race-summary"><summary><strong>Race ${esc(r.number)}</strong><span>${esc(r.track||'Track unavailable')}</span><span class="race-summary-winner">${esc(podium[0]?.display_name||'')}</span></summary>
    <ol class="podium-list">${podium.map(p=>`<li><span>${esc(p.place)}</span><div><strong>${esc(p.display_name||p.uma)}</strong><small>${esc(p.uma)}</small></div><b>+${esc(p.points)}</b></li>`).join('')}</ol>
    ${detailURL?`<a class="season-text-link" href="${esc(detailURL)}">Full finishing order →</a>`:''}</details>`;
  }).join('');
  const files=(m.races||[]).map(r=>`<a class="season-text-link" href="race.html?${esc(new URLSearchParams({round:m.round,match:m.id,race:r.race_folder,file:r.id}))}">${esc(r.race_folder)} · Race analysis →</a>`).join('');
  return `<section class="season-section match-race-results"><h2>Race Results</h2>${m.companion_conflict?'<p>Results are under review.</p>':''}${m.companion_series?.manualOverride?'<p>Scores adjusted by the tournament organizer.</p>':''}${cards?`<div class="race-list-labels"><span>Race</span><span>Course</span><span>Winner</span></div>${cards}`:''}${files}${!cards&&!files?'<p class="season-no-data">No confirmed race results.</p>':''}</section>`;
 }
 function archive(d){const m=d.index.matches.find(m=>m.id===d.params.get('match'));if(!m)return bracket(d);const draft=d.params.get('view')==='draft',view=draft?'draft':'results';return head('Match Details',`${esc(matchLabel(m.id))} · ${status(m,d.event.round_schedule,view)}`)+`${matchTabs(view,matchURL(m),matchURL(m,'draft'))}${Matchday.entrance(d,m)}${draft?'':results(m)}<section class="season-section"><h2>Lineups</h2>${Matchday.lineups(d,m)}</section>${draft?`<section class="season-stat-panel"><h2>Race Tracks</h2>${m.draft?.final_tracks?.length?`<ol class="draft-track-list">${m.draft.final_tracks.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>`:'<p>Draft tracks unavailable.</p>'}</section>`:''}`;}
 const views={home,bracket,tracks:matches,clubs,club,stats,rules,archive};
 global.DDT2Views={views,record,lineup,match,esc};
 if(typeof module!=='undefined'&&module.exports){module.exports=global.DDT2Views;return;}
 const root=document.getElementById('season-root');if(!root)return;
 const routes={index:'home',bracket:'bracket',tracks:'tracks',clubs:'clubs',club:'club',teams:'clubs',team:'club',stats:'stats',rules:'rules',archive:'archive'};
 let data,currentURL=location.href,navigating=false,clubQuery='',refreshing=false;
 const read=async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('Tournament information could not be loaded.');return r.json();};
 const page=u=>routes[u.pathname.split('/').pop().replace('.html','')||'index']||'home';
 const pose=key=>['bracket','stats','tracks','archive'].includes(key)?'assets/ddt2/gentildonna-concept.png':'assets/ddt2/gentildonna-race.png';
 const scene=document.querySelector('.season-scene');
 function render(url,focus){const key=page(url);data.params=url.searchParams;root.innerHTML=(data.index.companion_warning?'<p class="season-no-data" role="status">'+esc(data.index.companion_warning)+'</p>':'')+views[key](data);document.body.dataset.section=key;document.title=({home:'DDT2 · Who Will Dominate?',bracket:'Bracket · DDT2',tracks:'Matches · DDT2',clubs:'Teams · DDT2',club:'Team · DDT2',stats:'Stats · DDT2',rules:'Rules · DDT2',archive:'Match · DDT2'})[key];const navKey=key==='archive'?'tracks':key==='club'?'clubs':key;document.querySelectorAll('.season-header .ddt-nav a').forEach(link=>{if(page(new URL(link.href,location.href))===navKey)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});document.querySelector('.season-character').src=pose(key);currentURL=url.href;document.querySelectorAll('[data-art-id]').forEach(global.UmaRaceArt?.attach||(()=>{}));const input=document.getElementById('season-club-search');if(input){input.value=clubQuery;const filter=()=>{clubQuery=input.value;document.getElementById('season-club-list').innerHTML=directoryCards(data,clubQuery);global.UmaRaceArt?.attachAll();};input.addEventListener('input',filter);if(clubQuery)filter();}Matchday.present(root,data);Guide.present(root,key);if(focus)root.querySelector('h1')?.focus({preventScroll:true});}
 function redraw(){
  const active=document.activeElement, group=active?.closest?.('[data-lineup-group]');
  const saved={id:active?.id,follow:active?.dataset?.follow,runner:active?.dataset?.runner,group:group?.dataset.lineupGroup};
  render(new URL(location.href),false);
  let target=saved.id&&document.getElementById(saved.id);
  if(!target&&saved.follow!==undefined)target=[...root.querySelectorAll('[data-follow]')].find(el=>el.dataset.follow===saved.follow);
  if(!target&&saved.runner!==undefined)target=[...root.querySelectorAll('[data-lineup-group]')].find(el=>el.dataset.lineupGroup===saved.group)?.querySelectorAll('[data-runner]')[Number(saved.runner)];
  target?.focus({preventScroll:true});
 }
 Matchday.bind(root,()=>data,redraw);Guide.bind(root);
 async function refreshPublished(){
  if(!data||refreshing||navigating||document.hidden)return;
  refreshing=true;
  try{
   const [index,stats]=await Promise.all([read('data/tournament-index.json').then(index=>global.DDT2CompanionFeed?global.DDT2CompanionFeed.merge(index):index),read('data/tournament-statistics.json')]);
   if(index.id!==data.index.id||!Array.isArray(index.matches)||!Array.isArray(index.teams))throw Error('Invalid event update');
   const changed=JSON.stringify(index)!==JSON.stringify(data.index),recovered=data.syncError;
   data.syncError=false;
   if(changed){data.index=index;data.stats=stats;data.favorite=Matchday.preference.get(data.event.id,index.teams);}
   if(changed||recovered)redraw();
  }catch{if(!data.syncError){data.syncError=true;redraw();}}
  finally{refreshing=false;}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPublished();});
 window.setInterval?.(refreshPublished,60000);
 function scrollToSection(url,reset=false){let target;try{target=url.hash&&document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{}if(target)target.scrollIntoView({behavior:'instant',block:'start'});else if(reset)window.scrollTo({top:0,behavior:'instant'});}
 function navigate(url,{historyChange=true}={}){
  navigating=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage=document.querySelector('.season-character-stage'),character=document.querySelector('.season-character');
  const before=!reduced&&stage?.getBoundingClientRect?.();
  const previous=character?.getAttribute?.('src');
  const leaving=!reduced&&previous!==pose(page(url))?character?.cloneNode?.(false):null;
  const opacity=Number(global.getComputedStyle?.(root)?.opacity??1);
  for(const element of [root,stage,character])element?.getAnimations?.().forEach(a=>a.cancel());
  stage?.querySelectorAll?.('.season-character-leaving').forEach(el=>el.remove());
  try{
   if(historyChange)history.pushState({},'',url);
   render(url,true);scrollToSection(url,true);Matchday.present(root,data,{enter:true});
   if(!reduced&&page(url)!=='archive'){
    const timing={duration:360,easing:'cubic-bezier(.22,1,.36,1)'};
    root.animate([{opacity:Math.max(.35,Math.min(.65,opacity)),transform:'translateY(6px)'},{opacity:1,transform:'none'}],timing);
    const after=stage?.getBoundingClientRect?.();
    if(before&&before.bottom>0&&before.top<(global.innerHeight||Infinity)&&after?.width&&after?.height){
     stage.style.transformOrigin='top left';
     stage.animate([{transform:'translate('+ (before.left-after.left)+'px,'+(before.top-after.top)+'px) scale('+(before.width/after.width)+','+(before.height/after.height)+')'},{transform:'none'}],{...timing,duration:460});
    }
    if(leaving&&stage){
     leaving.classList.add('season-character-leaving');stage.append(leaving);
     const fade=leaving.animate([{opacity:1},{opacity:0}],{...timing,duration:220});
     fade.finished.then(()=>leaving.remove(),()=>leaving.remove());
     character.animate([{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'none'}],{...timing,duration:420});
    }
   }
  }catch{if(currentURL!==url.href)location.assign(url.href);}
  finally{navigating=false;}
 }
 document.addEventListener('click',e=>{const link=e.target.closest('a[href]');if(!link||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||link.hasAttribute('download')||link.target&&link.target!=='_self')return;const u=new URL(link.href,location.href),now=new URL(location.href),file=u.pathname.split('/').pop().replace('.html','');if(u.origin!==now.origin||u.pathname.slice(0,u.pathname.lastIndexOf('/'))!==now.pathname.slice(0,now.pathname.lastIndexOf('/'))||!(file in routes))return;if(!navigating&&u.pathname===now.pathname&&u.search===now.search&&u.hash)return;e.preventDefault();if(!navigating&&u.href===currentURL){window.scrollTo({top:0,behavior:'smooth'});return;}navigate(u);});
 window.addEventListener('popstate',()=>{if(!data)return;const next=new URL(location.href),previous=new URL(currentURL);if(next.pathname===previous.pathname&&next.search===previous.search){currentURL=next.href;return;}navigate(next,{historyChange:false});});
 document.querySelector('.season-footer').innerHTML=DDT2.footer();document.querySelector('.season-header').innerHTML=DDT2.header(page(new URL(location.href)));
 Promise.all([read('data/tournament-index.json').then(index=>global.DDT2CompanionFeed?global.DDT2CompanionFeed.merge(index):index),read('data/tournament-statistics.json'),read('config/event.json'),global.UmaRaceArt?.load(),read('assets/support-cards.json').catch(()=>({cards:{}}))]).then(([index,stats,event,_art,supports])=>{data={index,stats,event,supports,favorite:Matchday.preference.get(event.id,index.teams)};render(new URL(location.href),false);scrollToSection(new URL(location.href));Matchday.present(root,data,{enter:true});for(const src of ['assets/ddt2/gentildonna-race.png','assets/ddt2/gentildonna-concept.png']){const im=new Image();im.src=src;im.decode().catch(()=>{});}}).catch(()=>{root.innerHTML='<section class="season-workspace season-load-error"><h1>Tournament Information Unavailable</h1><p>Please refresh to try again.</p><button class="season-button" onclick="location.reload()">Refresh</button></section>';});
})(typeof window!=='undefined'?window:globalThis);
