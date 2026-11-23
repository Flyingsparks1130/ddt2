import './ddt2-ops.js';
import './ops.js';
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
let state,revision=-1,catalog=[],lineupHeat='',lineupRevision=-1,dirty=false;
function tab(id){document.querySelector(`[data-tab="${id}"]`)?.click();window.scrollTo({top:0,behavior:'smooth'});}
function note(text,error=false){$('notice').textContent=text;$('notice').hidden=false;$('notice').classList.toggle('error',error);}
function details(label,...nodes){const d=make('details',null,'operator-details');d.append(make('summary',label),...nodes);return d;}
const nav=document.querySelector('nav[aria-label="Workspace"]');
for(const [id,label] of [['show','Race desk'],['setup','Match setup'],['roster','Teams & connection'],['previews','Broadcast scenes'],['corrections','Corrections'],['history','Activity']]){const b=nav.querySelector(`[data-tab="${id}"]`);b.textContent=label;nav.append(b);}
nav.append($('version'));
document.querySelector('header h1').textContent='Tournament control';document.querySelector('header .muted').textContent='Prepare the matchup. Run the race. Approve the result.';
document.querySelector('header .eyebrow').textContent='DOMINATOR NETWORK';
for(const a of document.querySelectorAll('.header-links a'))a.textContent=a.textContent.replace(' ↗','');
const guide=make('section',null,'next-action');guide.innerHTML='<div><p class="eyebrow">YOUR NEXT STEP</p><h2 id="next-title">Connect your tournament</h2><p id="next-help"></p></div><button id="next-action">Open setup</button>';
$('show').prepend(guide);
const steps=make('div',null,'run-steps');steps.innerHTML='<span data-step="select">Choose a race</span><span data-step="capture">Capture</span><span data-step="review">Review & approve</span><span data-step="publish">Publish separately</span>';guide.after(steps);
const primary=document.querySelector('#show .primary'),aside=document.querySelector('#show aside');
aside.prepend($('series-card'));
const standings=$('player-standings').closest('section');$('history').append(details('Recorded-race standings',standings));
const setup=document.querySelector('#setup .setup-grid');setup.prepend($('series-form'));$('series-form').querySelector('h2').textContent='Create a matchup';$('series-form').querySelector('.help').textContent='Choose the two teams when the published bracket is not available. Each series has six races and a reserved tiebreaker.';$('series-form').querySelector('button').textContent='Create matchup';
const connection=details('Race capture & publishing connection',$('watch-form'),$('github-form'));connection.id='connection-settings';$('roster').prepend(connection);
$('roster').append(details('Other tournament formats',$('tournament-form'),$('match-form')));
const lineups=make('form',null,'card lineup-editor');lineups.id='lineup-form';lineups.innerHTML='<div class="card-heading"><div><p class="eyebrow">BEFORE THE RACE</p><h2>Choose the Umas</h2></div><span class="badge" id="lineup-count">No race selected</span></div><p class="help">These exact outfits appear behind the players in the matchup scene. Approved race results supply their recorded outfits automatically.</p><label>Race lineup<select id="lineup-heat"></select></label><datalist id="uma-options"></datalist><div id="lineup-players"></div><p id="lineup-help" class="help">Create a matchup to choose its lineup.</p><button id="save-lineup" disabled>Save lineup</button>';
setup.append(lineups);$('course-form').querySelector('h2').textContent='Set the drafted track';
$('select-heat').textContent='Use this race';$('arm').textContent='Capture next race';$('disarm').textContent='Cancel capture';$('approve').textContent='Approve race result';$('review-outcome').textContent='Confirm series outcome';
$('match-select').closest('.card').querySelector('h2').textContent='Choose the next race';$('sync').textContent='Use this race updates your broadcast scenes. Capture next race waits for one new horseACT file.';
$('review-card').querySelector('h2').textContent='Check the result';$('review-empty').textContent='Choose a captured race above. Check its players and points after the broadcast finishes.';
function fold(node,label){const wrapper=details(label);node.before(wrapper);wrapper.append(node);}
fold($('publication-json'),'Inspect the export JSON');
const correctionData=$('correction-preview'),reviewSummary=make('div',null,'correction-summary');reviewSummary.id='correction-summary';correctionData.before(reviewSummary);fold(correctionData,'Inspect correction data');
new MutationObserver(()=>{let data;try{data=JSON.parse(correctionData.textContent);}catch{return;}reviewSummary.replaceChildren();if(data.series)reviewSummary.append(make('h3',data.series));const names={score:'Set team scores',automatic:'Use calculated scores',outcome:'Confirm the series winner',reopen:'Reopen the series'};if(data.change)reviewSummary.append(make('p',names[data.change]||data.change));if(data.currentScores){const list=make('div',null,'correction-scores');for(const [i,row] of data.currentScores.entries()){const cell=make('div');cell.append(make('span',row.team),make('strong',row.points+' points now'));if(data.newScores){const entry=data.newScores[row.id];cell.append(make('b',entry+' points after approval'));}list.append(cell);}reviewSummary.append(list);}if(data.winner)reviewSummary.append(make('p','Winner: '+data.winner,'outcome-winner'));if(data.podium)for(const row of data.podium)reviewSummary.append(make('p',`${row.rank}. ${row.playerName} · ${row.points} points`));if(data.reason)reviewSummary.append(make('p','Reason: '+data.reason,'help'));}).observe(correctionData,{childList:true,characterData:true,subtree:true});
function current(){return state?.matches.find(m=>m.heats.some(h=>h.id===state.activeHeatId));}
function renderGuide(){const match=current(),series=state.series.find(s=>s.id===match?.id),pending=state.races.find(r=>r.status==='pending'&&r.heatId===state.activeHeatId);let title,help,action,label,step='select';
 if(state.tournament.id!=='ddt2'){title='Load the DDT2 teams';help='Import the published roster once, then choose your matchup.';label='Connect DDT2';action=()=>tab('roster');}
 else if(!state.matches.length){title='Load the bracket';help='Open Teams & connection to import the published matchups.';label='Open bracket';action=()=>tab('roster');}
 else if(!match){title='Choose the race you are running';help='Select a matchup and race below, then click Use this race.';label='Choose race';action=()=>$('match-select').focus();}
 else if(pending){step='review';title='A race is ready to review';help='Check the track and confirm the players. Approve the finishing order once the race ends on broadcast.';label='Review captured race';action=()=>{document.querySelector(`[data-race-id="${pending.id}"]`)?.click();$('review-card').scrollIntoView({behavior:'smooth',block:'start'});};}
 else if(series?.races.some(r=>r.heatId===state.activeHeatId)){
  const next=match.heats.find(h=>!series.races.some(r=>r.heatId===h.id));
  if(series.leaderId&&!series.winnerId){
   step='review';title='Confirm the series winner';help='Check the final score before recording the outcome.';label='Confirm outcome';action=()=>$('review-outcome').click();
  }else if(next&&!series.winnerId){
   const raceName=next.tiebreaker?'the tiebreaker':'Race '+next.number;
   title='Ready for '+raceName;help='The approved result is on the scoreboard.';label='Use '+raceName;
   action=()=>{
    $('match-select').value=match.id;$('match-select').dispatchEvent(new Event('change'));
    $('heat-select').value=next.id;$('select-heat').click();
   };
  }else{
   step='publish';title=series.winnerId?'Series complete':'All races approved';help='Review the result before publishing to the site.';label='Review publication';action=()=>$('preview-publish').click();
  }
 }
 else if(state.armedHeatId){step='capture';title='Waiting for the race file';help='Run the selected race. The next complete horseACT export will enter the review inbox. Nothing publishes automatically.';label='View matchup scene';action=()=>{tab('previews');$('preview-live').checked=true;$('preview-live').dispatchEvent(new Event('change'));document.querySelector('[data-url="/matchup?demo=1"]').click();};}
 else if(!state.watch.enabled){step='capture';title='Import the race result';help='Choose the horseACT JSON for this race. For automatic capture, connect the Saved races folder in Teams & connection.';label='Import horseACT JSON';action=()=>$('race-file').click();}
 else{step='capture';title='Ready to capture the next race';help='Check the selected matchup and lineup, then start capture before the race. One file will be attached to this race.';label='Capture next race';action=()=>$('arm').click();}
 $('next-title').textContent=title;$('next-help').textContent=help;$('next-action').textContent=label;$('next-action').onclick=action;for(const el of steps.children)el.classList.toggle('current',el.dataset.step===step);
}
function rebuildLineup(force=false){if(dirty&&!force)return;const old=$('lineup-heat').value;const heats=state.matches.flatMap(m=>m.heats.map(h=>({m,h})));$('lineup-heat').replaceChildren(...heats.map(({m,h})=>{const o=make('option',`${m.name} · ${h.number===7?'Tiebreaker':'Race '+h.number}`);o.value=h.id;return o;}));if(heats.some(x=>x.h.id===old))$('lineup-heat').value=old;else if(state.activeHeatId)$('lineup-heat').value=state.activeHeatId;lineupHeat=$('lineup-heat').value;lineupRevision=state.revision;const target=heats.find(x=>x.h.id===lineupHeat);$('lineup-players').replaceChildren();if(!target){$('save-lineup').disabled=true;return;}
 const {m,h}=target,approved=state.series.find(s=>s.id===m.id)?.races.some(r=>r.heatId===h.id);let count=0;
 for(const teamId of m.teamIds||[]){const group=make('section',null,'lineup-group');group.append(make('h3',state.tournament.teams.find(t=>t.id===teamId)?.name));for(const player of state.tournament.players.filter(p=>m.playerIds.includes(p.id)&&p.teamId===teamId)){const row=make('div',null,'lineup-player'),image=make('img'),label=make('label',player.name),input=make('input');input.setAttribute('list','uma-options');input.placeholder='Search Uma or outfit…';input.dataset.playerId=player.id;input.setAttribute('aria-label','Uma for '+player.name);const uma=catalog.find(c=>c.card===h.lineup?.[player.id]);input.value=uma?`${uma.name} (${uma.outfit})`:'';image.alt='';image.hidden=!uma;if(uma){image.src=`/assets/cards/${uma.card}.png`;count++;}image.onerror=()=>{image.hidden=true;};input.disabled=!!approved;input.oninput=()=>{dirty=true;const chosen=catalog.find(c=>`${c.name} (${c.outfit})`===input.value);image.hidden=!chosen;if(chosen)image.src=`/assets/cards/${chosen.card}.png`;};label.append(input);row.append(image,label);group.append(row);}$('lineup-players').append(group);}
 $('lineup-count').textContent=`${count} / ${m.playerIds.length} selected`;$('save-lineup').disabled=!!approved;$('lineup-help').textContent=approved?'This race is approved. Its recorded Uma outfits are used in the broadcast.':'Leave a player blank to show “Uma to be announced”. This changes the matchup artwork, never the scoring.';dirty=false;
}
$('lineup-heat').onchange=()=>{dirty=false;rebuildLineup(true);};
$('lineup-form').onsubmit=async e=>{e.preventDefault();const button=$('save-lineup');button.disabled=true;try{const entries=[...$('lineup-players').querySelectorAll('input')].map(input=>{const value=input.value.trim(),uma=catalog.find(c=>`${c.name} (${c.outfit})`===value);if(value&&!uma)throw Error('Choose a listed Uma and outfit for every filled player.');return {playerId:input.dataset.playerId,card:uma?.card??null};});const r=await fetch('/api/ops/lineup',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:lineupRevision,heatId:lineupHeat,entries})});const response=await r.json();if(!r.ok)throw Error(response.error);dirty=false;note('Lineup saved. The matchup scene now uses these exact outfits.');document.dispatchEvent(new Event('opsrefresh'));}catch(err){note(err.message,true);}finally{button.disabled=false;}};
function render(next){state=next;renderGuide();if(revision===state.revision)return;revision=state.revision;rebuildLineup();}
document.addEventListener('opsstate',e=>render(e.detail));
try{const response=await fetch('/api/ops/uma-catalog');if(!response.ok)throw Error('Uma list unavailable');catalog=await response.json();$('uma-options').replaceChildren(...catalog.map(uma=>{const o=make('option');o.value=`${uma.name} (${uma.outfit})`;return o;}));render(await(await fetch('/api/ops/state')).json());}catch(e){note(e.message,true);}
