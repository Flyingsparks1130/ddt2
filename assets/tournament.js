/* Independent tournament UI. No dependency on the old bracket CSS or JS. */
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pathUrl=s=>String(s).split('/').map(encodeURIComponent).join('/');
const pageUrl=(params={})=>(params.race||params.file?'race.html?':'archive.html?')+new URLSearchParams(params);
const labelStatus=s=>String(s).replaceAll('_',' ');
const participantName=value=>/^<@!?\d+>$/.test(String(value||''))?'Name pending':String(value||'').replace(/^@+/,'')||'Name pending';
async function getJSON(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return r.json()}
let index,csrf,adminState;
function shell(){
 $('.dt-header').innerHTML=DDT2.header(document.body.dataset.page);
 $('.dt-footer').innerHTML=DDT2.footer();
}
function crumbs(items=[]){return `<nav class="dt-breadcrumb" aria-label="Breadcrumb"><a href="bracket.html">DDT2 tournament</a>${items.map(x=>`<span class="sep">/</span>${x.href?`<a href="${esc(x.href)}">${esc(x.name)}</a>`:`<span aria-current="page">${esc(x.name)}</span>`}`).join('')}</nav>`}
function teamName(id){return index.teams.find(t=>t.id===id)?.name||'Unassigned'}
function matchName(m){return m.participants.map((p,i)=>p?.name||`Winner of ${m.sources[i].winner_of.toUpperCase()}`).join(' vs ')}
function badge(m){return `<span class="race-status ${m.winner_id?'is-final':m.status==='ready'?'is-ready':''}">${esc(TournamentUI.status(m))}</span>`}
function roundName(id){return index.rounds.find(x=>x.id===id)?.name||id}
function matchCard(m){return TournamentUI.matchCard(m)}
function courseFacts(c){return [c.distance_m?c.distance_m+'m':null,c.surface,c.turn,c.condition,c.weather,c.season].filter(Boolean)}
function matchTabs(m, active){
 return `<nav class="dt-match-tabs" aria-label="Match sections">${[['results','Race results'],['draft','Match draft']].map(([view,label])=>`<a href="${pageUrl({round:m.round,match:m.id,view})}" ${view===active?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
function umaPortrait(r){
 return r?.portrait?`<img class="dt-uma-portrait" src="${esc(r.portrait)}" alt="" loading="lazy">`:'';
}
function rosterTeam(m, team, contributions=false){
 const rows=(contributions?m.player_points||[]:m.draft_lineup||m.lineup||m.draft?.roster||[]).filter(r=>r.team_id===team.id);
 if(!rows.length)return '';
 const mvp=m.reported_results?.mvp;
 return `<ul class="dt-roster">${rows.map(r=>{
  const isMvp=!r.benched&&mvp?.team_id===r.team_id&&mvp?.display_name===r.display_name&&(mvp?.variant_id?mvp.variant_id===r.variant_id:mvp?.uma===r.uma);
  return `<li class="${r.benched?'dt-benched':''}"><div class="dt-roster-person">${umaPortrait(r)}<div><strong>${esc(r.benched?r.uma:r.display_name||participantName(r.discord))}</strong><span>${esc(r.benched?'Not fielded':r.uma)}</span>${isMvp?'<span class="dt-badge red">MVP</span>':''}</div></div>${r.benched?'<span class="dt-badge">Bench</span>':contributions?`<div class="dt-player-points"><strong>${m.player_points_recorded?r.points:'—'}</strong><span>pts</span></div>`:''}</li>`;
 }).join('')}</ul>`;
}
function matchPlayers(m){
 if(!m.player_points?.length)return '';
 const mvp=m.reported_results?.mvp;
 return `<section class="dt-contributions"><div class="dt-caption"><div><p class="dt-kicker">The team effort</p><h2>Player Contributions</h2></div><span class="dt-small">Match podium points</span></div><div class="dt-grid">${m.participants.filter(Boolean).map((t,side)=>{
  const rows=m.player_points.filter(r=>r.team_id===t.id);
  return `<article class="dt-lineup-team dt-side-${side}"><header><div><p class="dt-kicker">${rows.length} trainers</p><h3>${esc(t.name)}</h3></div><span class="race-team-points">${m.player_points_recorded?rows.reduce((n,r)=>n+r.points,0):'—'} <small>pts</small></span></header><ul class="dt-pick-cards race-contribution-cards">${rows.map(r=>{
   const star=mvp?.team_id===t.id&&mvp?.display_name===r.display_name&&(r.variant_id?mvp.variant_id===r.variant_id:mvp.uma===r.uma);
   return `<li class="${star?'is-mvp':''}"><div class="dt-pick-art">${umaPortrait(r)}<span class="dt-pick-tag">${star?'★ MVP · ':''}${m.player_points_recorded?r.points:'—'} pts</span></div><div class="dt-pick-name"><strong>${esc(r.display_name||participantName(r.discord))}</strong><span>${esc(r.uma)}</span></div></li>`;
  }).join('')}</ul></article>`;
 }).join('')}</div></section>`;
}
function raceNav(m,current=''){
 if(!m.races.length)return '';
 return `<nav class="dt-race-nav" aria-label="Races in this match">${m.races.map(f=>`<a href="${pageUrl({round:m.round,match:m.id,race:f.race_folder,file:f.id})}" ${current===f.id?'aria-current="page"':''}><small>Race ${esc(f.race_folder.match(/^\d+/)?.[0].replace(/^0/,''))}</small><strong>${esc(f.race_folder.replace(/^\d+\s*-\s*/,''))}</strong></a>`).join('')}</nav>`;
}
function reportRaceLinks(m, number){
 const files=m.races.filter(f=>Number(f.race_folder.match(/^(\d+)\s*-/)?.[1])===number);
 return files.length?'<div class="dt-button-row">'+files.map((f,i)=>`<a class="dt-button" href="${pageUrl({round:m.round,match:m.id,race:f.race_folder,file:f.id})}">Race analysis${files.length>1?' '+(i+1):''} →</a>`).join('')+'</div>':'';
}
function reportedResults(m){
 const report=m.reported_results;
 if(!report)return matchPlayers(m);
 const teams=m.participants.filter(Boolean),mvp=report.mvp;
 const scoreRows=s=>teams.map((t,i)=>`<p class="dt-side-${i}"><span>${esc(t.name)}</span><b>${esc(s[t.id]??'—')}</b></p>`).join('');
 return `${mvp?`<section class="dt-mvp"><div class="dt-mvp-person">${umaPortrait(mvp)}<div><p class="dt-kicker">★ Match MVP</p><h2>${esc(mvp.display_name||participantName(mvp.discord))}</h2><p>${esc(mvp.uma)} · ${esc(teamName(mvp.team_id))}</p></div></div><div class="dt-mvp-points"><strong>${mvp.points??0}</strong><span>podium points</span></div></section>`:''}${matchPlayers(m)}<div class="dt-caption"><div><p class="dt-kicker">The finish line</p><h2>Race-by-race Results</h2><p class="dt-small">${report.races.filter(r=>!r.tiebreaker).length} standard races${report.races.some(r=>r.tiebreaker)?' + tiebreaker':''} · Podium finishes earn 4 / 2 / 1 points</p></div>${report.external_match_id?`<span class="dt-badge">${esc(report.external_match_id)}</span>`:''}</div>${m.report_score_mismatch?'<div class="dt-notice">The official score has an organizer adjustment. These race cards preserve the originally reported podium totals.</div>':''}<ol class="race-results-grid">${report.races.map(r=>{
  const [title,...parts]=r.track.split(' · '),tags=parts.flatMap(p=>p.split(' / '));
  return `<li class="race-result ${r.tiebreaker?'is-tiebreaker':''}"><header><span class="dt-ticket-number">${String(r.number).padStart(2,'0')}</span><div><span class="race-eyebrow">${r.tiebreaker?'Tiebreaker':'Race '+r.number}</span><h3>${esc(title)}</h3><div class="dt-track-tags">${tags.map(t=>`<span class="${t==='Turf'?'is-turf':t==='Dirt'?'is-dirt':''}">${esc(t)}</span>`).join('')}</div></div></header><ol class="race-podium">${r.podium.map((p,i)=>`<li class="dt-side-${teams.findIndex(t=>t.id===p.team_id)}"><div class="race-podium-art">${umaPortrait(p)}<span class="race-medal">${['1ST','2ND','3RD'][i]} · ${p.points} PTS</span></div><div class="race-podium-info"><strong>${esc(p.uma)}</strong><span>${esc(p.display_name||participantName(p.discord))}</span><small>${esc(teamName(p.team_id))}</small></div></li>`).join('')}</ol><div class="race-result-scores"><div><span>Race score</span>${scoreRows(r.scores)}</div><div><span>Running total</span>${scoreRows(r.cumulative_scores)}</div></div>${reportRaceLinks(m,r.number)}</li>`;
 }).join('')}</ol><div class="dt-notice"><strong>Reported total</strong> · ${teams.map(t=>esc(t.name)+' '+esc(report.totals[t.id])).join(' / ')}</div><div class="dt-button-row"><a class="dt-button" href="${pathUrl(m.report_path)}" download="results.json">Download results</a><a class="dt-button" href="${pageUrl({round:m.round,match:m.id,view:'draft'})}">View the match draft →</a></div>`;
}
function draftContent(m){
 const d=m.draft;
 if(!m.draft_has_content)return '<div class="dt-empty">The draft for this matchup has not been added yet.</div>';
 const stage={pending:'Draft pending',in_progress:'Draft in progress',locked:'Draft locked'}[d.status];
 const teams=m.participants.filter(Boolean),lineup=m.draft_lineup||d.roster||[],mvp=m.reported_results?.mvp;
 const actionRows=key=>(m.draft_uma_actions?.[key]||d[key]||[]).map((r,i)=>({...r,order:i+1}));
 const chips=(key,label,team,opponent=false)=>{
  const rows=actionRows(key).filter(r=>opponent?r.team_id!==team.id:r.team_id===team.id);
  if(!rows.length)return '';
  return `<section class="dt-draft-action ${key.includes('ban')?'is-ban':''}"><h4>${label}</h4><ul>${rows.map(r=>`<li>${umaPortrait(r)}<span>${key==='uma_picks'?`<small>Pick ${r.order}</small>`:''}${esc(r.uma)}</span>${key.includes('ban')?'<b aria-hidden="true">×</b>':''}</li>`).join('')}</ul></section>`;
 };
 const teamCards=teams.map((t,side)=>{
  const assigned=lineup.filter(r=>r.team_id===t.id);
  const selections=actionRows('uma_selections').filter(r=>r.team_id===t.id);
  const selectionOnly=!assigned.length&&selections.length>0;
  const rows=selectionOnly?selections:assigned;
  const vetoes=d.track_vetoes.filter(r=>r.team_id===t.id);
  return `<article class="dt-lineup-team dt-side-${side}"><header><div><p class="dt-kicker">${selectionOnly?`${rows.length} drafted`:`${rows.filter(r=>!r.benched).length} fielded · ${rows.filter(r=>r.benched).length} bench`}</p><h3>${esc(t.name)}</h3></div><span class="dt-team-seal" aria-hidden="true">${esc(t.name.slice(0,2).toUpperCase())}</span></header><ul class="dt-pick-cards">${rows.map(r=>{
   const star=!r.benched&&mvp?.team_id===t.id&&(r.variant_id?mvp.variant_id===r.variant_id:mvp.uma===r.uma);
   return `<li class="${r.benched?'is-bench':''} ${star?'is-mvp':''}"><div class="dt-pick-art">${umaPortrait(r)}<span class="dt-pick-tag">${selectionOnly?'Drafted':r.benched?'Bench':star?'★ Match MVP':'Fielded'}</span></div><div class="dt-pick-name"><strong>${esc(selectionOnly||r.benched?r.uma:r.display_name||participantName(r.discord))}</strong><span>${esc(selectionOnly?'Player assignment pending':r.benched?'Not fielded':r.uma)}</span></div></li>`;
  }).join('')}</ul>${selectionOnly?'<p class="dt-muted">Player lineup and bench not recorded.</p>':!rows.length?'<p class="dt-muted">Player lineup not recorded.</p>':''}<div class="dt-draft-tactics">${chips('uma_pre_bans','Pre-banned',t)}${chips('uma_bans','Vetoed by opponent',t,true)}${chips('uma_picks','Snake picks',t)}${chips('uma_additions','Additional picks',t)}${!rows.length?chips('benched_umas','Bench',t):''}${vetoes.length?`<section class="dt-draft-action is-track-veto"><h4>Track Vetoes Made</h4><ul>${vetoes.map(r=>`<li><b aria-hidden="true">×</b><span>${esc(r.track)}</span></li>`).join('')}</ul></section>`:''}</div></article>`;
 }).join('');
 const ticket=(track,i,tiebreaker=false)=>{
  const parts=track.split(' · '),title=parts.shift(),tags=parts.flatMap(p=>p.split(' / '));
  const picker=d.track_picks.find(p=>p.track===track),side=teams.findIndex(t=>t.id===picker?.team_id);
  return `<li class="dt-race-ticket ${tiebreaker?'is-tiebreaker':`dt-side-${side}`}"><span class="dt-ticket-number">${tiebreaker?'TB':String(i+1).padStart(2,'0')}</span><div><small>${tiebreaker?'Tiebreaker':`Race ${i+1}${picker?' · '+esc(teamName(picker.team_id))+' pick':''}`}</small><strong>${esc(title)}</strong><div class="dt-track-tags">${tags.map(tag=>`<span class="${tag==='Turf'?'is-turf':tag==='Dirt'?'is-dirt':''}">${esc(tag)}</span>`).join('')}</div></div></li>`;
 };
 // Keep picks absent from the final schedule available without repeating the whole card.
 const extras=d.track_picks.filter(r=>!d.final_tracks.includes(r.track));
 return `<section class="dt-draft-board"><header class="dt-draft-intro"><div><p class="dt-kicker">The draft${d.external_match_id?' / '+esc(d.external_match_id):''}</p><h2>Meet the Lineup.</h2><p class="dt-small">The picks, the rivals, the road to victory.</p></div><span class="dt-badge red">${stage}</span></header><div class="dt-lineup-grid"><span class="dt-draft-versus" aria-hidden="true">VS</span>${teamCards}</div><div class="dt-caption"><div><p class="dt-kicker">On the starting line</p><h2>Race Schedule</h2></div><span class="dt-small">${d.final_tracks.length} races${d.tiebreaker_track?' + tiebreaker':''}</span></div>${d.final_tracks.length?`<ol class="dt-race-tickets">${d.final_tracks.map((track,i)=>ticket(track,i)).join('')}${d.tiebreaker_track?ticket(d.tiebreaker_track,6,true):''}</ol>`:'<p class="dt-muted">The final tracks have not been recorded.</p>'}${!d.final_tracks.length&&d.tiebreaker_track?`<ol class="dt-race-tickets">${ticket(d.tiebreaker_track,6,true)}</ol>`:''}${extras.length?`<details class="dt-panel"><summary>Other track picks</summary><ul>${extras.map(r=>`<li>${esc(teamName(r.team_id))} · ${esc(r.track)}</li>`).join('')}</ul></details>`:''}${d.training_start||d.training_deadline?`<div class="dt-data-facts">${d.training_start?`<span class="dt-fact">Training opens · ${esc(d.training_start)}</span>`:''}${d.training_deadline?`<span class="dt-fact">Submission deadline · ${esc(d.training_deadline)}</span>`:''}</div>`:''}${d.track_pool.length?`<details class="dt-panel"><summary>Track pool · ${d.track_pool.length} tracks</summary><ul>${d.track_pool.map(track=>`<li>${esc(track)}</li>`).join('')}</ul></details>`:''}${d.notes?`<details class="dt-panel"><summary>Match notes</summary><p class="dt-draft-notes">${esc(d.notes)}</p></details>`:''}${m.draft_path?`<div class="dt-button-row"><a class="dt-button" href="${pathUrl(m.draft_path)}" download="draft.json">Download draft JSON</a></div>`:''}</section>`;
}
function draftsHub(){
 $('#dt-root').innerHTML=`${crumbs([{name:'Match drafts'}])}<div class="dt-head"><div><p class="dt-kicker">The starting line</p><h1>Match Drafts</h1><p class="dt-lead">Each matchup has its own track pool, picks, vetoes and final race card.</p></div></div>${index.rounds.map(r=>`<section><div class="dt-caption"><h2>${esc(r.id+' · '+r.name)}</h2></div><div class="dt-grid">${index.matches.filter(m=>m.round===r.id).map(m=>TournamentUI.matchCard(m,{view:'draft'})).join('')}</div></section>`).join('')}`;
}
function blankDraft(mid){
 return {schema_version:1,match_id:mid,status:'pending',track_pool:[],track_picks:[],track_vetoes:[],final_tracks:[],tiebreaker_track:null,uma_pre_bans:[],uma_picks:[],uma_bans:[],uma_additions:[],benched_umas:[],uma_selections:[],training_start:null,training_deadline:null,notes:'',external_match_id:null,roster:[]};
}
function bindDraftEditor(m){
 const holder=document.createElement('section');holder.className='dt-panel';
 holder.innerHTML=`<h2>Match Draft JSON</h2><p class="dt-small">Save this matchup’s track pool, picks, vetoes, final tracks and Uma selections in its own draft.json. Drafts are recorded for the current event.</p><p class="dt-small">Team IDs for this match: ${m.participants.filter(Boolean).map(t=>`<code>${esc(t.id)}</code>`).join(' · ')}</p><div class="dt-button-row"><button class="dt-button" id="download-draft">Download ${m.draft?'current draft':'blank template'}</button><a class="dt-button" href="${pageUrl({round:m.round,match:m.id,view:'draft'})}" target="_blank" rel="noopener">Preview draft ↗</a></div><label class="dt-label" for="draft-upload">Choose draft JSON</label><input class="dt-input" id="draft-upload" type="file" accept=".json,application/json"><div class="dt-button-row"><button class="dt-button" id="save-draft" ${m.participants.every(Boolean)?'':'disabled'}>Save this match’s draft</button></div><p class="dt-small">Saving replaces only this match’s draft.json. Enter a reason in the left panel.</p>`;
 $('#admin-detail').appendChild(holder);
 $('#download-draft').onclick=()=>{const data=m.draft||blankDraft(m.id),blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='draft.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('#save-draft').onclick=async()=>{
  const f=$('#draft-upload').files[0];if(!f)return toast('Choose a draft JSON file.');
  try{
   if(f.size>20*1024*1024)throw new Error('File exceeds 20 MB.');
   const raw=await f.text();
   adminState=await api('/api/draft',{revision:index.revision,match_id:m.id,reason:$('#admin-reason').value,raw_text:raw,draft_json:JSON.parse(raw.replace(/^\uFEFF/,''))});
   index=adminState.index;renderAdmin();toast('Match draft saved locally. Commit and push to publish.');
  }catch(e){toast(e.message)}
 };
}

async function archive(p=new URLSearchParams(location.search)){
 const activeView=p.get('view')==='draft'?'draft':'results';
 let round=p.get('round'),mid=p.get('match'),raceFolder=p.get('race'),fid=p.get('file');
 if(!round){location.replace('bracket.html');return}
 const r=index.rounds.find(r=>r.id===round);if(!r)throw new Error('Round not found.');
 const bc=[{name:r.name,href:pageUrl({round})}];
 if(!mid){$('#dt-root').innerHTML=`${crumbs([{name:r.name}])}<div class="dt-head"><div><p class="dt-kicker">${r.id}</p><h1>${esc(r.name)}</h1><p class="dt-lead">Choose a matchup to view its race folders, results and official score.</p></div></div><div class="dt-grid">${index.matches.filter(m=>m.round===round).map(matchCard).join('')}</div>`;return}
 const m=index.matches.find(m=>m.id===mid&&m.round===round);if(!m)throw new Error('Match not found.');
 bc.push({name:matchName(m),href:pageUrl({round,match:mid})});
 const title=matchName(m);
 const scoreboard=TournamentUI.scoreboard(m);
 if(!raceFolder){
  if(activeView==='draft'){
   $('#dt-root').innerHTML=`${crumbs(bc.map((x,i)=>i===bc.length-1?{name:x.name}:x))}<div class="dt-head"><div><p class="dt-kicker">${esc(roundName(round))}</p><h1>${esc(title)}</h1></div>${badge(m)}</div>${scoreboard}${matchTabs(m,'draft')}${draftContent(m)}`;
   return;
  }
  const groups=[...new Set(m.races.map(r=>r.race_folder))];
  $('#dt-root').innerHTML=`${crumbs(bc.map((x,i)=>i===bc.length-1?{name:x.name}:x))}<div class="dt-head"><div><p class="dt-kicker">${esc(roundName(round))}</p><h1>${esc(title)}</h1></div>${badge(m)}</div>${scoreboard}${matchTabs(m,'results')}${m.needs_review?'<div class="dt-notice">Some race results need team assignments.</div>':''}${m.winner_id?`<div class="dt-notice"><strong>${esc(teamName(m.winner_id))} ${m.round==='R4'?'wins the tournament':'advances'}.</strong></div>`:''}${raceNav(m)}${reportedResults(m)}<div class="dt-caption"><h2>Race Results</h2><span class="dt-small">${m.races.length} JSON files</span></div>${groups.length?`<div class="dt-grid">${groups.map(name=>{const files=m.races.filter(r=>r.race_folder===name);return `<a class="dt-folder-card" href="${pageUrl({round,match:mid,race:name,...(files.length===1?{file:files[0].id}:{})})}"><div class="dt-folder-icon">RACE</div><h3>${esc(name)}</h3><p>${files.length===1?'Results & replay':files.length+' race files'}</p><p>${esc(courseFacts(files[0].course).join(' · '))}</p></a>`}).join('')}</div>`:`<div class="dt-empty">${m.reported_results?'Original race JSON is unavailable. The reported race results are shown above.':m.score_only?'Official scores recorded. Race JSON is not available for this matchup.':m.winner_id?'Match complete. No race JSON is available for this matchup.':'Race results have not been added yet.'}</div>`}`;return
 }
 const files=m.races.filter(r=>r.race_folder===raceFolder);if(!files.length)throw new Error('Race folder not found.');
 bc.push({name:raceFolder,href:pageUrl({round,match:mid,race:raceFolder})});
 if(!fid&&files.length===1)fid=files[0].id;
 if(!fid){$('#dt-root').innerHTML=`${crumbs(bc.map((x,i)=>i===bc.length-1?{name:x.name}:x))}<div class="dt-head"><div><p class="dt-kicker">Race folder</p><h1>${esc(raceFolder)}</h1><p class="dt-lead">Select an original race export. Repeated runs can be kept together under this race description.</p></div></div><div class="dt-grid">${files.map(f=>`<a class="dt-folder-card" href="${pageUrl({round,match:mid,race:raceFolder,file:f.id})}"><div class="dt-folder-icon">JSON EXPORT</div><h3>${esc(f.file_name)}</h3><p>${f.runner_count} runners · ${f.scoring_verified?'Team assignments verified':'Team mapping / review pending'}</p></a>`).join('')}</div>`;return}
 const meta=files.find(f=>f.id===fid);if(!meta)throw new Error('File not found.');
 const data=await getJSON(pathUrl(meta.data_file));
 bc.push({name:'Race analysis'});
 $('#dt-root').classList.add('rp-page');
 $('#dt-root').innerHTML=`${crumbs(bc)}<div class="dt-head"><div><p class="dt-kicker">Race analysis</p><h1>${esc(raceFolder.replace(/^\d+\s*-\s*/,''))}</h1><p class="dt-lead">${esc(matchName(m))}</p></div><span class="dt-badge">${data.runner_count} runners</span></div><div class="dt-data-facts">${courseFacts(data.course).map(f=>`<span class="dt-fact">${esc(f)}</span>`).join('')}</div>${raceNav(m,fid)}<div id="race-analysis"></div><div class="dt-button-row"><a class="dt-button" href="${pathUrl(data.raw_path)}" download>Download original JSON</a><a class="dt-button" href="${pageUrl({round,match:mid})}">Back to match results</a></div>`;
 const dispose=await RaceReplay.mount($('#race-analysis'),data,teamName);
 window.addEventListener('pagehide',event=>event.persisted?dispose.pause():dispose());
}
function toast(text){document.querySelector('.dt-alert')?.remove();const el=document.createElement('div');el.className='dt-alert';el.setAttribute('role','status');el.textContent=text;document.body.append(el);setTimeout(()=>el.remove(),9500)}
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.error||`HTTP ${r.status}`);return result}
async function initAdmin(){
 try{const s=await getJSON('/api/session');csrf=s.csrf;adminState=await getJSON('/api/state');index=adminState.index;renderAdmin()}
 catch(e){$('#dt-root').innerHTML=`<div class="dt-head"><div><p class="dt-kicker">Local organizer console</p><h1>Start the Organizer Backend.</h1><p class="dt-lead">This page writes to your local repository, not to GitHub directly.</p></div></div><div class="dt-panel"><p>Double-click <code>manage_tournament.bat</code> inside your cloned repo. It opens this console on <code>http://127.0.0.1:8765/admin.html</code>.</p><p class="dt-small">The public GitHub Pages site cannot run this Python backend. No passwords or repository tokens belong in this page.</p><details><summary>Connection details</summary><p>${esc(e.message)}</p></details></div>`}
}
function renderAdmin(){
 if(!index.matches.length){$('#dt-root').innerHTML='<div class="dt-head"><h1>DDT2 Setup</h1></div><div class="dt-panel"><h2>No Matches Configured</h2><p>Add the new event’s teams, rounds and matches to Dominator Tournament/tournament.json, then rebuild the index.</p></div>';return;}
 const keep=$('#admin-match')?.value||index.matches.find(m=>m.status==='ready')?.id||index.matches[0].id;
 $('#dt-root').innerHTML=`${crumbs([{name:'Organizer'}])}<div class="dt-head"><div><p class="dt-kicker">Local backend connected · Revision ${index.revision}</p><h1>Organizer Console.</h1><p class="dt-lead">Import files, verify teams, adjust scores and advance winners. Changes are saved to your local repo; commit and push to publish.</p></div><a class="dt-button" href="bracket.html" target="_blank">Preview site ↗</a></div><div class="dt-admin-columns"><aside class="dt-panel"><h3>Choose a Match</h3><select id="admin-match" class="dt-input">${index.rounds.map(r=>`<optgroup label="${esc(r.id+' · '+r.name)}">${index.matches.filter(m=>m.round===r.id).map(m=>`<option value="${m.id}" ${m.id===keep?'selected':''}>${m.id.toUpperCase()} · ${esc(matchName(m))}</option>`).join('')}</optgroup>`).join('')}</select><div class="dt-button-row"><button class="dt-button" id="rebuild">Rescan folders</button></div><p class="dt-small">Files dropped into the repo manually are discovered when you rescan or build.</p><div class="dt-rule"></div><label class="dt-label" for="admin-reason">Reason for this change</label><input id="admin-reason" class="dt-input" placeholder="e.g. Confirmed official result"><p class="dt-small">Required for score, assignment and advancement changes.</p></aside><div id="admin-detail"></div></div><section class="dt-panel"><h2>Recent Organizer Activity</h2>${adminState.audit.length?[...adminState.audit].reverse().map(a=>`<div class="dt-log"><strong>${esc(a.action)} · ${esc(a.match_id)}</strong><div class="dt-small">${esc(a.at)} · revision ${a.revision}</div><div>${esc(a.reason||a.path||'')}</div></div>`).join(''):'<p class="dt-small">No changes yet.</p>'}</section>`;
 $('#admin-match').addEventListener('change',renderAdminMatch);
 $('#rebuild').onclick=async()=>{try{adminState=await api('/api/build',{});index=adminState.index;renderAdmin();toast('Folders rescanned. No Git push was performed.')}catch(e){toast(e.message)}};
 renderAdminMatch();
}
function renderAdminMatch(){
 const m=index.matches.find(m=>m.id===$('#admin-match').value);const ready=m.participants.every(Boolean);const teams=m.participants.filter(Boolean);
 $('#admin-detail').innerHTML=`<div class="dt-panel" style="margin-top:0"><div class="dt-caption" style="margin-top:0"><h2>${esc(matchName(m))}</h2>${badge(m)}</div><p class="dt-small">${esc(m.id.toUpperCase())} · ${m.races.length} imported race files</p>${!ready?'<div class="dt-notice">Confirm the previous-round winner first. This match cannot be scored or finalized until both opponents are known.</div>':''}<h3>Official Scores</h3><div class="dt-form-row">${teams.map(t=>`<div><label class="dt-label" for="score-${t.id}">${esc(t.name)}</label><input class="dt-input dt-manual-score" id="score-${t.id}" data-team="${t.id}" type="number" min="0" step="1" value="${m.scores?.[t.id]??''}" placeholder="Not scored"></div>`).join('')}</div><p class="dt-small">Computed scores: ${m.computed_scores?esc(teams.map(t=>`${t.name} ${m.computed_scores[t.id]}`).join(' · ')):m.races.length?'Waiting for verified runner assignments':'No race JSON needed to enter official scores'}</p><div class="dt-button-row"><button class="dt-button" id="save-scores" ${!ready?'disabled':''}>Save official scores</button><button class="dt-button" id="clear-scores" ${!ready?'disabled':''}>Use computed scores</button></div><label class="dt-label" for="winner-select">Winner to advance</label><select class="dt-input" id="winner-select"><option value="">Choose winner</option>${teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><div class="dt-button-row"><button class="dt-button primary" id="advance" ${!ready?'disabled':''}>Confirm winner & advance</button><button class="dt-button danger" id="forfeit" ${!ready?'disabled':''}>Advance by opponent forfeit</button><button class="dt-button" id="reopen">Reopen match</button></div><p class="dt-small">Advancing eliminates the losing team and fills the linked next-round slot. Existing downstream records block changing an earlier winner.</p></div><div class="dt-panel"><h2>Import a Race JSON</h2><label class="dt-label" for="race-folder">Race-description folder</label><input id="race-folder" class="dt-input" placeholder="01 - 2200m Turf Left Good"><div class="dt-drop"><input id="race-upload" type="file" accept=".json,application/json"></div><button class="dt-button" id="import-race" ${!ready||m.winner_id?'disabled':''}>Import into this match</button><div id="upload-progress" class="dt-progress"></div><p class="dt-small">Original files are not overwritten. Re-importing the same race is blocked.</p></div><div class="dt-panel dt-admin-mapping"><h2>Trainer → Team Assignments</h2><p class="dt-small">Ghost runners are not automatically disqualified. Uncheck Eligible only for a non-scoring replacement.</p><select id="mapping-file" class="dt-input"><option value="">Choose a race export</option>${m.races.map(r=>`<option value="${r.id}">${esc(r.race_folder+' / '+r.file_name)}</option>`).join('')}</select><div id="mapping-rows"></div></div>`;
 const reason=()=>$('#admin-reason').value;
 async function control(payload){try{adminState=await api('/api/control',{revision:index.revision,match_id:m.id,reason:reason(),...payload});index=adminState.index;renderAdmin();toast('Saved locally. Commit and push when ready to publish.')}catch(e){toast(e.message)}}
 $('#save-scores').onclick=()=>{const fields=[...document.querySelectorAll('.dt-manual-score')];if(fields.some(f=>f.value===''))return toast('Enter both official scores.');control({action:'score',scores:Object.fromEntries(fields.map(f=>[f.dataset.team,Number(f.value)]))})};
 $('#clear-scores').onclick=()=>control({action:'score',scores:null});
 for(const action of ['advance','forfeit'])$('#'+action).onclick=()=>{const winner=$('#winner-select').value;if(!winner)return toast('Choose the winning team first.');const loser=teams.find(t=>t.id!==winner);if(confirm(`Advance ${teamName(winner)} and eliminate ${loser.name}${action==='forfeit'?' by forfeit':''}?`))control({action,winner_id:winner})};
 $('#reopen').onclick=()=>{if(confirm('Reopen this match and remove its manual score and winner? Downstream records must be cleared first.'))control({action:'reopen'})};
 $('#import-race').onclick=async()=>{const f=$('#race-upload').files[0];if(!f)return toast('Choose a JSON export.');const desc=$('#race-folder').value;try{if(f.size>20*1024*1024)throw new Error('File exceeds 20 MB.');$('#upload-progress').textContent='Validating and importing…';const raw=await f.text();adminState=await api('/api/import',{revision:index.revision,match_id:m.id,race_folder:desc,file_name:f.name,raw_text:raw,race_json:JSON.parse(raw)});index=adminState.index;renderAdmin();toast('Race imported. Now verify trainer assignments before using calculated scores.')}catch(e){$('#upload-progress').textContent='';toast(e.message)}};
 bindDraftEditor(m);
 $('#mapping-file').onchange=async()=>{const rid=$('#mapping-file').value;if(!rid){$('#mapping-rows').innerHTML='';return}try{const meta=m.races.find(r=>r.id===rid),race=await getJSON(pathUrl(meta.data_file));$('#mapping-rows').innerHTML=`<div class="dt-table-scroll"><table class="dt-table"><thead><tr><th>Runner</th><th>Team</th><th>Eligible</th></tr></thead><tbody>${race.results.map(r=>`<tr data-entry="${r.entry_id}"><td><strong>${esc(r.owner||'Unknown')}</strong><div class="dt-small">${esc(r.uma)} · #${r.place}</div></td><td><select class="dt-input map-team"><option value="">Unassigned</option>${teams.map(t=>`<option value="${t.id}" ${r.team_id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></td><td><input class="dt-check map-eligible" type="checkbox" ${r.eligible?'checked':''} aria-label="Eligible ${esc(r.owner)}"></td></tr>`).join('')}</tbody></table></div><label class="dt-label"><input type="checkbox" id="remember" checked> Reuse owner-to-team mapping for other race files in this match</label><button class="dt-button" id="save-mapping">Save assignments</button>`;$('#save-mapping').onclick=()=>control({action:'mapping',race_id:rid,remember_owners:$('#remember').checked,assignments:Object.fromEntries([...document.querySelectorAll('[data-entry]')].map(tr=>[tr.dataset.entry,{team_id:tr.querySelector('.map-team').value||null,eligible:tr.querySelector('.map-eligible').checked}]))})}catch(e){toast(e.message)}};
}
async function boot(){if(document.body.dataset.page==='archive'&&!new URLSearchParams(location.search).has('round')){location.replace('bracket.html'+location.hash);return}shell();if(document.body.dataset.page==='admin'){await initAdmin();return}try{index=await getJSON('data/tournament-index.json');await archive()}catch(e){$('#dt-root').innerHTML=`<div class="dt-error"><h2>Could Not Load the Tournament.</h2><p>${esc(e.message)}</p><p>Please refresh or return to the tournament.</p><a class="dt-button" href="bracket.html">Tournament</a></div>`;console.error(e)}}
boot();
