import {courseCatalogReady,outfitCatalog} from './ddt2-ops.js';
import {raceLabels,suggestedPlayer,reservePlayers} from './model.js';
const $=id=>document.getElementById(id);
let state=null,reviewData=null,selectedRace=null,publication=null,busy=false,setupLoaded=false,lastRenderedRevision=-1;
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
const notice=(message,error=false)=>{$('notice').hidden=false;$('notice').textContent=message;$('notice').classList.toggle('error',error);};
const time=iso=>new Date(iso).toLocaleString();
async function api(route,body){const options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:state?.revision,...body})};const res=await fetch('/api/ops/'+route,{...options,cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Operation failed');return data;}
async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(e){notice(e.message,true);await refresh();}finally{busy=false;}}
function heatOptions(select,current){select.replaceChildren(node('option','Select a heat'));select.firstChild.value='';for(const match of state.matches)for(const heat of match.heats){const option=node('option',`${match.name} · ${match.stage||match.round} · ${heat.tiebreaker?'Tiebreaker':'Race '+heat.number}`);option.value=heat.id;select.append(option);}select.value=current||'';}
function findHeat(heatId){for(const match of state.matches){const heat=match.heats.find(h=>h.id===heatId);if(heat)return {match,heat};}return null;}
function matchOptions(){
 const select=$('match-select'),old=select.value,active=findHeat(state.activeHeatId);
 select.replaceChildren(new Option('Select a match',''));
 for(const match of state.matches)select.add(new Option(match.name,match.id));
 select.value=state.matches.some(m=>m.id===old)?old:active?.match.id||'';
 updateHeats();
}
$('reset-match').addEventListener('click',()=>{
 const match=state.matches.find(m=>m.id===$('match-select').value);
 if(!match)return;
 const revision=state.revision;
 if(!confirm('Reset '+match.name+' to 0–0 and clear its race results and winner? The teams, tracks and lineups stay in place.'))return;
 action(async()=>{await api('reset-match',{matchId:match.id,confirm:true,revision});$('heat-select').value=match.heats[0]?.id||'';notice('Match reset to 0–0.');});
});
function updateHeats(){const old=$('heat-select').value;const match=state.matches.find(m=>m.id===$('match-select').value);$('heat-select').replaceChildren();for(const h of match?.heats||[]){const approved=state.races.some(r=>r.heatId===h.id&&r.status==='approved')||(state.manualHeats||[]).some(r=>r.heatId===h.id&&r.status==='approved');const o=node('option',`${h.number===7?'Tiebreaker':'Race '+h.number}${approved?' · Approved':''}`);o.value=h.id;$('heat-select').append(o);}if(match?.heats.some(h=>h.id===old))$('heat-select').value=old;else if(match?.heats.some(h=>h.id===state.activeHeatId))$('heat-select').value=state.activeHeatId;$('select-heat').disabled=!match;$('reset-match').disabled=!state.canResetMatch||!match||match.heats.some(h=>h.id===state.armedHeatId);syncDeskSelection();}
function syncDeskSelection(){
 const match=state.matches.find(m=>m.id===$('match-select').value);

 document.dispatchEvent(new Event('deskselection'));
}
$('heat-select').addEventListener('change',syncDeskSelection);
function setup(){if(setupLoaded)return;const t=state.tournament;$('tournament-name').value=t.name;$('points').value=t.rules?.points.join(', ')||'';$('tiebreak').value=t.rules?.tiebreak||'shared';$('participants').value=t.players.map(p=>`${p.name} | ${p.gameName} | ${p.team}`).join('\n');$('watch-folder').value=state.watch.folder||state.suggestedWatchFolder||'';$('watch-enabled').checked=state.watch.enabled;for(const key of ['owner','repo','branch','file'])$('github-'+key).value=state.github[key];setupLoaded=true;}
function standings(id,rows){const target=$(id);target.replaceChildren();if(!rows.length){target.textContent=id==='team-standings'?'No team scores yet.':'No approved scores yet.';return;}for(const row of rows){const el=node('div',null,'standings-row');el.append(node('span',row.rank),node('b',row.name),node('span',`${row.points} pts`));target.append(el);}}
function render(){if(!state)return;const active=findHeat(state.activeHeatId),approved=state.races.filter(r=>r.status==='approved').length+(state.manualHeats||[]).filter(r=>r.status==='approved').length,pending=state.races.filter(r=>r.status==='pending').length;
 document.dispatchEvent(new CustomEvent('opsstate',{detail:state}));
 $('bridge').textContent=state.bridge.connected?(state.bridge.active?`Game connected · ${state.bridge.count} runners`:'Game connected · Waiting'):'Game offline · Operations available';$('bridge').className='badge'+(state.bridge.connected?' live':'');
 $('active-title').textContent=active?.match.name||'No heat selected';$('active-subtitle').textContent=active?`${[...new Set([active.match.stage,active.match.round])].filter(Boolean).join(' · ')} · ${active.heat.number===7?'Tiebreaker':'Race '+active.heat.number}`:(state.matches.length?'Choose a match and race below.':'Import the published bracket in Teams & connection.');
 $('format-label').textContent=state.tournament.rules?'Points by finishing position':'To be decided';$('format-detail').textContent=state.tournament.rules?`${state.tournament.rules.points.join(' / ')} · ${state.tournament.rules.tiebreak==='shared'?'Shared ties':'Countback ties'}`:'Scoring and approval wait for configured rules.';
 $('counts').textContent=`${approved} approved`;$('queue-count').textContent=`${pending} awaiting review`;$('armed').textContent=state.armedHeatId?'Waiting for the next race':'Not armed';$('armed').className='badge'+(state.armedHeatId?' warning':'');$('disarm').hidden=!state.armedHeatId;$('arm').disabled=!active||!state.watch.enabled||!!state.armedHeatId;
 $('sync').textContent=state.overlayNotice||'Broadcast This Race updates your broadcast scenes. Capture next race waits for one new horseACT file.';
 $('watch-status').textContent=state.watch.enabled?`Watching ${state.watch.folder}${state.watchNotice?' · '+state.watchNotice:''}`:'Folder watching is off. Import a JSON file to begin.';
 $('tournament-fields').disabled=state.locked||state.tournament.id==='ddt2';$('locked').textContent=state.tournament.id==='ddt2'?'DDT2 roster and 4 / 2 / 1 scoring are managed through Teams & connection.':state.locked?'Rules and participants are locked because approved results exist.':'The scoring format can stay blank while you decide the rules.';
 $('github-token').textContent=state.publication.tokenAvailable?'Server publishing credentials are available.':'DDT2 destination is configured; GitHub publishing credentials are still needed.';
 if(state.revision===lastRenderedRevision)return;lastRenderedRevision=state.revision;setup();matchOptions();
 const selectedPlayers=[...$('match-players').selectedOptions].map(o=>o.value);$('match-players').replaceChildren();for(const p of state.tournament.players){const o=node('option',p.name+(p.team?' · '+p.team:''));o.value=p.id;o.selected=selectedPlayers.includes(p.id);$('match-players').append(o);}
 $('inbox').replaceChildren();if(!state.races.length)$('inbox').textContent='No races imported yet.';
 for(const race of [...state.races].reverse()){const button=node('button',null,'inbox-row'+(selectedRace===race.id?' selected':''));button.dataset.raceId=race.id;const labels=node('span');labels.append(node('strong',race.filename));const heat=findHeat(race.heatId);labels.append(node('small',`${race.count} runners · ${heat?heat.match.name+' / Heat '+heat.heat.number:'Unassigned'} · ${time(race.importedAt)}`));button.append(labels,node('span',race.status,'badge'));button.addEventListener('click',()=>action(()=>openReview(race.id)));$('inbox').append(button);}
 standings('player-standings',state.standings.players);standings('team-standings',state.standings.teams);
 $('audit').replaceChildren();for(const event of state.audit){const el=node('div',null,'audit-item');el.append(node('strong',event.action.replaceAll('.',' / ')),node('small',time(event.at)));if(event.detail?.operator||event.detail?.reason)el.append(node('p',event.detail.operator||event.detail.reason));$('audit').append(el);}if(!state.audit.length)$('audit').textContent='No activity yet.';
 $('publications').replaceChildren();for(const entry of state.publications){const el=node('div',null,'audit-item');el.append(node('strong',`${entry.target.owner}/${entry.target.repo}`),node('small',time(entry.at)),node('p',entry.commit?`Commit ${entry.commit.slice(0,12)}`:'Existing matching publication confirmed'));$('publications').append(el);}if(!state.publications.length)$('publications').textContent='Nothing has been sent to GitHub.';
}
async function refresh(){try{state=await api('state');render();}catch(e){notice('Companion connection unavailable: '+e.message,true);}}
let reviewRevision=0,outfits=new Map();
function reviewRoster(){
 const heatId=$('assign-heat').value;
 const {match,heat}=findHeat(heatId)||{};
 const players=state.tournament.players.filter(p=>match?.playerIds.includes(p.id));
 return {heatId,match,players,lineup:match?.lineup||heat?.lineup};
}
function renderReviewRows(){
 const {race,review}=reviewData,{match,players,heatId,lineup}=reviewRoster();
 const pending=race.status!=='void';
 $('race-rows').replaceChildren();
 const chosen=new Map(),reserved=new Set(),suggestions=new Map();
 for(const row of review.rows){
  const saved=heatId===race.heatId&&(race.mapping?.[row.index]||row.playerId);
  if(players.some(p=>p.id===saved)&&!reserved.has(saved)){
   chosen.set(row.index,saved);reserved.add(saved);
  }else{
   const id=suggestedPlayer(row,players,lineup,review.rows);
   if(id){const candidates=suggestions.get(id)||[];candidates.push(row.index);suggestions.set(id,candidates);}
  }
 }
 for(const [id,indices] of suggestions){
  if(!reserved.has(id)&&indices.length===1)chosen.set(indices[0],id);
 }
 for(const row of review.rows){
  const tr=node('tr'),identity=node('td',row.name);
  identity.append(node('small',[outfits.get(row.card)?.outfit,'Gate '+row.gate].filter(Boolean).join(' · ')),node('small',row.trainer||'Name missing from capture'));
  const who=node('td');
  if(pending){
   const select=node('select');select.dataset.runner=String(row.index);
   select.setAttribute('aria-label','Participant for gate '+row.gate);
   select.add(new Option(match?'Choose player':'Choose a match first',''));
   for(const player of players)select.add(new Option(player.name+(player.team?' · '+player.team:''),player.id));
   select.value=chosen.get(row.index)||'';select.disabled=!players.length;
   who.append(select);
  }else who.textContent=row.playerName||'—';
  tr.append(node('td',row.rank,'numeric'),identity,who,node('td',Number(row.finishTime).toFixed(3),'numeric'),node('td',row.points??'—','numeric'));
  $('race-rows').append(tr);
 }
 reviewStatus();
}
function reviewStatus(){
 const {race,review}=reviewData,{match,players,heatId,lineup}=reviewRoster();
 const pending=race.status!=='void',ddt=state.tournament.id==='ddt2';
 const selectors=[...$('race-rows').querySelectorAll('select')];
 reservePlayers(selectors);
 const picked=selectors.filter(s=>s.value),unique=new Set(picked.map(s=>s.value)).size;
 const wrongSize=ddt&&race.runners.length!==10;
 const complete=!!match&&picked.length===selectors.length&&(!ddt||(unique===10&&players.length===10&&!wrongSize));
 const saved=!!match&&heatId===race.heatId&&complete&&selectors.every(s=>race.mapping?.[s.dataset.runner]===s.value);
 let status='';
 if(pending){
  if(wrongSize)status='This capture has '+race.runners.length+' runners. A DDT2 result requires 10.';
  else if(!match)status='Choose the match and race to load its players.';
  else if(saved)status='Players confirmed. Check the order and points, enter your name, then approve once the race ends on broadcast.';
  else if(unique<picked.length&&ddt)status='A player is selected twice. Choose a different player for one of those gates.';
  else status=picked.length+' of '+selectors.length+' players selected. '+(complete?'Check the names, then confirm.':'Choose a player for each remaining gate.');
 }
 $('roster-status').textContent=status;
 $('save-mapping').hidden=!pending||race.status==='approved';$('save-mapping').disabled=!match||(ddt&&!complete)||saved;
 $('save-mapping').textContent=ddt?'Confirm players':'Save participant assignments';
 $('assign').hidden=ddt||!pending;$('assign').disabled=!match||heatId===race.heatId;
 const problems=review.problems.filter(p=>!pending||(!p.startsWith('Assign gate ')&&!p.startsWith('Missing participant:')&&p!=='Assign this race to a match and heat.'&&p!=='DDT2 needs ten runners, one per registered player.'&&p!=='Assign each of the ten runners to a different registered player.'));
 $('review-problems').replaceChildren(...(heatId===race.heatId?problems:[]).map(p=>node('li',p)));
 if(race.voidReason)$('review-problems').append(node('li','Voided: '+race.voidReason));
 const reviewedMapping=selectors.every((select,i)=>select.value===(review.rows[i]?.playerId||''));
 if(race.status==='approved'){
  $('roster-status').textContent='Check the assignments and confirm to replace this result.';
  return complete;
 }
 return pending&&(ddt?saved:heatId===race.heatId&&reviewedMapping)&&review.canApprove;
}
async function openReview(raceId){
 reviewRevision=state.revision;
 const [detail,courses,catalog]=await Promise.all([api('race/'+raceId),courseCatalogReady,outfitCatalog]);
 outfits=new Map(catalog.map(uma=>[uma.card,uma]));
 reviewData=detail;selectedRace=raceId;
 const {race,review}=detail,track=review.track;
 const course=track.name?.trim()||courses.find(c=>c.id===Number(track.id))?.name;
 const labels=raceLabels({...track,track:course,trackId:track.id});
 $('approve').textContent=race.status==='approved'?'Save race correction':'Approve race result';
 $('review-title').textContent=race.filename;$('review-status').textContent=race.status;
 $('review-track').textContent=[labels.track,labels.distance,labels.surface,track.going&&labels.going,track.weather&&labels.weather,track.season&&labels.season].filter(Boolean).join(' · ');
 $('review-empty').hidden=true;$('review-content').hidden=false;
 const pending=race.status!=='void';
 heatOptions($('assign-heat'),race.heatId||(pending&&($('heat-select').value||state.activeHeatId)));
 $('assign-heat').disabled=!pending;$('approval-form').hidden=!pending;
 $('void').disabled=race.status==='void';$('void-reason').value='';$('broadcast-finished').checked=false;$('approve').disabled=true;
 renderReviewRows();$('review-card').scrollIntoView({behavior:'smooth',block:'start'});
}
$('assign-heat').onchange=()=>{renderReviewRows();$('broadcast-finished').checked=false;$('approve').disabled=true;};
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{for(const view of document.querySelectorAll('.view'))view.hidden=view.id!==button.dataset.tab;for(const tab of document.querySelectorAll('.tab'))tab.classList.toggle('active',tab===button);});
$('match-select').addEventListener('change',updateHeats);
$('select-heat').addEventListener('click',()=>action(async()=>{await api('select',{heatId:$('heat-select').value});notice('Heat selected. The broadcast header is synchronized.');}));
$('arm').addEventListener('click',()=>action(async()=>{await api('arm',{});notice('Armed. The next new valid race file will be staged for this heat.');}));
$('disarm').addEventListener('click',()=>action(()=>api('disarm',{})));
$('race-file').addEventListener('change',()=>action(async()=>{const file=$('race-file').files[0];if(!file)return;try{if(file.size>16*1024*1024)throw Error('File exceeds the 16 MB limit.');const query=new URLSearchParams({filename:file.name,heat:state.activeHeatId||''});
 const res=await fetch('/api/ops/import-file?'+query,{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:file});
 const result=await res.json();if(!res.ok)throw Error(result.error||'Race import failed.');await refresh();await openReview(result.id);notice(result.duplicate?'This replay is already in the inbox; no duplicate was created.':'Race imported for review. Nothing has been published.');}finally{$('race-file').value='';}}));
$('tournament-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{const points=$('points').value.trim();const players=$('participants').value.split('\n').filter(line=>line.trim()).map(line=>{const [name,gameName,team='']=line.split('|').map(v=>v.trim());if(!name||!gameName)throw Error('Use: Display name | In-game name | Team (optional).');const existing=state.tournament.players.find(p=>p.gameName===gameName.replace(/^@+/,''));return {id:existing?.id,name,gameName,team};});await api('setup',{name:$('tournament-name').value,players,rules:points?{points:points.split(',').map(v=>v.trim()?Number(v):NaN),tiebreak:$('tiebreak').value}:null});setupLoaded=false;notice('Tournament setup saved.');});});
$('match-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{await api('match',{name:$('match-name').value,round:$('round-name').value,stage:$('stage-name').value,heats:Number($('heat-count').value),playerIds:[...$('match-players').selectedOptions].map(o=>o.value),expected:{distance:Number($('expected-distance').value),surface:Number($('expected-surface').value),trackId:Number($('expected-track').value)}});notice('Match created. Select its first heat on the Race desk.');});});
$('watch-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{await api('watch',{folder:$('watch-folder').value,enabled:$('watch-enabled').checked});notice('Race folder saved. Existing files will not be imported automatically.');});});
$('github-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{await api('github',Object.fromEntries(['owner','repo','branch','file'].map(key=>[key,$('github-'+key).value])));notice('GitHub destination saved. No files were published.');});});
$('assign').addEventListener('click',()=>action(async()=>{await api('assign',{raceId:selectedRace,heatId:$('assign-heat').value});await refresh();await openReview(selectedRace);}));
$('save-mapping').addEventListener('click',()=>action(async()=>{
 const heatId=$('assign-heat').value,raceId=selectedRace;
 if(state.revision!==reviewRevision)throw Error('The desk has changed. Reopen this capture before confirming the players.');
 const mapping=Object.fromEntries([...$('race-rows').querySelectorAll('select')].filter(s=>s.value).map(s=>[s.dataset.runner,s.value]));
 if(reviewData.race.heatId!==heatId){
  await api('assign',{raceId,heatId,revision:reviewRevision});
  reviewRevision++;reviewData.race.heatId=heatId;reviewData.race.mapping={};
 }
 await api('map',{raceId,mapping,revision:reviewRevision});
 await refresh();await openReview(raceId);notice('Players saved. Check the points before approving.');
}));
function approvalReady(){$('approve').disabled=!reviewData||!reviewStatus()||!$('broadcast-finished').checked||!$('operator').value.trim();}
$('broadcast-finished').addEventListener('change',approvalReady);$('operator').addEventListener('input',approvalReady);
$('race-rows').addEventListener('change',()=>{$('broadcast-finished').checked=false;$('approve').disabled=true;reviewStatus();});
$('approve').addEventListener('click',()=>action(async()=>{const corrected=reviewData.race.status==='approved';
 const mapping=Object.fromEntries([...$('race-rows').querySelectorAll('select')].filter(s=>s.value).map(s=>[s.dataset.runner,s.value]));
 await api(corrected?'revise':'approve',{raceId:selectedRace,revision:reviewRevision,heatId:$('assign-heat').value,mapping,reviewHash:reviewData.review.hash,operator:$('operator').value,broadcastFinished:$('broadcast-finished').checked});await refresh();await openReview(selectedRace);notice('Result approved. Local standings updated; nothing has been sent to GitHub.');}));
$('void').addEventListener('click',()=>action(async()=>{await api('void',{raceId:selectedRace,reason:$('void-reason').value});await refresh();await openReview(selectedRace);notice('Race voided. Local standings recalculated. Publish again if the old result was already online.');}));
$('preview-publish').addEventListener('click',()=>action(async()=>{publication=await api('publication');$('publication-description').textContent=`${publication.approvedCount} recorded races and ${publication.manualCount||0} manual races. Approved static scores and outcomes are included. Pending changes are excluded.`;$('publication-destination').textContent=Object.values(publication.target).every(Boolean)?`${publication.target.owner}/${publication.target.repo} · ${publication.target.branch} · ${publication.target.file}`:'GitHub destination not configured';$('publication-json').textContent=JSON.stringify(publication.bundle,null,2);$('publication-blocked').textContent=publication.reason||'';$('publish').disabled=!publication.ready||publication.alreadyPublished;$('publication-dialog').showModal();}));
$('close-publication').addEventListener('click',()=>$('publication-dialog').close());
$('publish').addEventListener('click',()=>action(async()=>{const result=await api('publish',{hash:publication.hash,targetHash:publication.targetHash});$('publication-dialog').close();notice(result.reconciled?'The matching approved results are already on GitHub.':'Approved results committed to GitHub. Your site may take a moment to deploy.');}));
document.addEventListener('opsrefresh',()=>{setupLoaded=false;lastRenderedRevision=-1;refresh();});
await refresh();setInterval(()=>{if(!busy)refresh();},2000);
