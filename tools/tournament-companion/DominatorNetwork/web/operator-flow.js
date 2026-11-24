import {setupScenes} from './desk-scenes.js';
import {outfitCatalog} from './ddt2-ops.js';
import './ops.js';
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
let state,revision=-1,catalog=[],lineupMatch='',lineupRevision=-1,dirty=false;
function tab(id){document.querySelector(`[data-tab="${id}"]`)?.click();window.scrollTo({top:0,behavior:'smooth'});}
function note(text,error=false){$('notice').textContent=text;$('notice').hidden=false;$('notice').classList.toggle('error',error);}
function details(label,...nodes){const d=make('details',null,'operator-details');d.append(make('summary',label),...nodes);return d;}
const nav=document.querySelector('nav[aria-label="Workspace"]');
for(const [id,label] of [['show','Race desk'],['roster','Teams & connection'],['previews','Broadcast scenes'],['corrections','Finalize'],['history','Activity']]){const b=nav.querySelector(`[data-tab="${id}"]`);b.textContent=label;nav.append(b);}
nav.append($('version'));
document.querySelector('header h1').textContent='Tournament control';document.querySelector('header .muted').textContent='Prepare the matchup. Run the race. Approve the result.';
document.querySelector('header .eyebrow').textContent='DOMINATOR NETWORK';
const guide=make('section',null,'next-action');guide.innerHTML='<div><p class="eyebrow">YOUR NEXT STEP</p><h2 id="next-title">Connect your tournament</h2><p id="next-help"></p></div><button id="next-action">Open setup</button>';
$('show').prepend(guide);
const steps=make('div',null,'run-steps');steps.innerHTML='<span data-step="select">Select matchup</span><span data-step="capture">Capture</span><span data-step="review">Confirm race</span><span data-step="publish">Finalize matchup</span>';guide.after(steps);
const primary=document.querySelector('#show .primary'),aside=document.querySelector('#show aside');
aside.prepend($('series-card'));
const standings=$('player-standings').closest('section');$('history').append(details('Recorded-race standings',standings));
$('github-form').hidden=true;
const connection=details('Race capture connection',$('watch-form'),$('github-form'));connection.id='connection-settings';$('roster').prepend(connection);
$('roster').append(details('Other tournament formats',$('tournament-form'),$('match-form')));
$('connection-forms').remove();
const lineups=make('form',null,'card lineup-editor');lineups.id='lineup-form';
lineups.innerHTML='<div class="card-heading"><h2 id="lineup-team-names">Match Lineup</h2><span class="badge" id="lineup-count"></span></div><datalist id="uma-options"></datalist><div id="lineup-players"></div><p id="lineup-help" class="help"></p><button id="save-lineup" disabled>Save lineup</button>';
const lineupPanel=details('Match Lineup',lineups);
$('match-select').closest('.card').after(lineupPanel);
$('select-heat').textContent='Broadcast This Race';$('arm').textContent='Capture next race';$('disarm').textContent='Cancel capture';$('approve').textContent='Approve race result';$('review-outcome').textContent='Finalize matchup';
$('match-select').closest('.card').querySelector('h2').textContent='On Air';$('sync').textContent='Choose a past or upcoming race, then select Broadcast This Race. Capture next race waits for one new horseACT file.';
$('review-card').querySelector('h2').textContent='Check the result';$('review-empty').textContent='Choose a captured race above. Check its players and points after the broadcast finishes.';
function fold(node,label){const wrapper=details(label);node.before(wrapper);wrapper.append(node);}
fold($('publication-json'),'Inspect the export JSON');
const correctionData=$('correction-preview'),reviewSummary=make('div',null,'correction-summary');reviewSummary.id='correction-summary';correctionData.before(reviewSummary);fold(correctionData,'Inspect correction data');
new MutationObserver(()=>{let data;try{data=JSON.parse(correctionData.textContent);}catch{return;}reviewSummary.replaceChildren();if(data.series)reviewSummary.append(make('h3',data.series));const names={score:'Set team scores',automatic:'Use calculated scores',outcome:'Confirm the series winner',reopen:'Reopen the series'};if(data.change)reviewSummary.append(make('p',names[data.change]||data.change));if(data.currentScores){const list=make('div',null,'correction-scores');for(const [i,row] of data.currentScores.entries()){const cell=make('div');cell.append(make('span',row.team),make('strong',row.points+' points now'));if(data.newScores){const entry=data.newScores[row.id];cell.append(make('b',entry+' points after approval'));}list.append(cell);}reviewSummary.append(list);}if(data.winner)reviewSummary.append(make('p','Winner: '+data.winner,'outcome-winner'));if(data.podium)for(const row of data.podium)reviewSummary.append(make('p',`${row.rank}. ${row.playerName} · ${row.points} points`));if(data.reason)reviewSummary.append(make('p','Reason: '+data.reason,'help'));}).observe(correctionData,{childList:true,characterData:true,subtree:true});
function current(){return state?.matches.find(m=>m.heats.some(h=>h.id===state.activeHeatId));}
function renderGuide(){const match=current(),series=state.series.find(s=>s.id===match?.id),pending=state.races.find(r=>r.status==='pending'&&r.heatId===state.activeHeatId);let title,help,action,label,step='select';
 if(state.tournament.id!=='ddt2'){title='Load the DDT2 teams';help='Import the published roster once, then choose your matchup.';label='Connect DDT2';action=()=>tab('roster');}
 else if(!state.matches.length){title='Load the bracket';help='Open Teams & connection to import the published matchups.';label='Open bracket';action=()=>tab('roster');}
 else if(!match){title='Choose the race you are running';help='Select a matchup and race below, then click Broadcast This Race.';label='Choose race';action=()=>$('match-select').focus();}
 else if(series?.winnerId && series.teams.some(t=>t.id===series.winnerId&&t.points>=series.target)){
  step='publish';title='Matchup confirmed';help=match.name;label='Download match ZIP';action=()=>{location.href='/api/ops/match-zip?match='+encodeURIComponent(match.id);};
 }
 else if(series?.leaderId&&!series.winnerId){
  step='publish';title='Finalize the matchup';help='Check the winning team and final score.';label='Review final score';action=()=>$('review-outcome').click();
 }
 else if(pending){step='review';title='A race is ready to review';help='Check the track and confirm the players. Approve the finishing order once the race ends on broadcast.';label='Review captured race';action=()=>{document.querySelector(`[data-race-id="${pending.id}"]`)?.click();$('review-card').scrollIntoView({behavior:'smooth',block:'start'});};}
 else if(series?.races.some(r=>r.heatId===state.activeHeatId)){
  const next=match.heats.find(h=>!series.races.some(r=>r.heatId===h.id));
  if(next&&!series.winnerId){
   const raceName=next.tiebreaker?'the tiebreaker':'Race '+next.number;
   title='Ready for '+raceName;help='The approved result is on the scoreboard.';label='Use '+raceName;
   action=()=>{
    $('match-select').value=match.id;$('match-select').dispatchEvent(new Event('change'));
    $('heat-select').value=next.id;$('select-heat').click();
   };
  }else{
   step='review';title='Review the matchup';help='Check the approved races and both team totals.';label='Open Finalize';action=()=>$('review-outcome').click();
  }
 }
 else if(state.armedHeatId){step='capture';title='Waiting for the race file';help='Run the selected race. The next complete horseACT export will enter the review inbox. Nothing publishes automatically.';label='View matchup scene';action=()=>{tab('previews');$('preview-live').checked=true;$('preview-live').dispatchEvent(new Event('change'));document.querySelector('[data-url="/matchup?demo=1"]').click();};}
 else if(!state.watch.enabled){step='capture';title='Import the race result';help='Choose the horseACT JSON for this race. For automatic capture, connect the Saved races folder in Teams & connection.';label='Import horseACT JSON';action=()=>$('race-file').click();}
 else{step='capture';title='Ready to capture the next race';help='Check the selected matchup and lineup, then start capture before the race. One file will be attached to this race.';label='Capture next race';action=()=>$('arm').click();}
 $('next-title').textContent=title;$('next-help').textContent=help;$('next-action').textContent=label;$('next-action').onclick=action;for(const el of steps.children)el.classList.toggle('current',el.dataset.step===step);
}
function rebuildLineup(force=false){
 if(!state)return;
 const match=state.matches.find(m=>m.id===$('match-select').value);
 lineupPanel.hidden=!match?.teamIds?.length;
 if(!force&&dirty&&lineupMatch===match?.id)return;
 dirty=false;lineupMatch=match?.id||'';lineupRevision=state.revision;
 const target=$('lineup-players');target.replaceChildren();
 if(lineupPanel.hidden)return;
 $('lineup-team-names').textContent=match.name;
 const started=state.series.some(s=>s.id===match.id&&s.raceCount>0);
 const available=catalog.length>0&&state.matchLineups;
 for(const teamId of match.teamIds){
  const group=make('section',null,'lineup-group');
  group.append(make('h3',state.tournament.teams.find(t=>t.id===teamId)?.name));
  for(const player of state.tournament.players.filter(p=>p.teamId===teamId&&match.playerIds.includes(p.id))){
   const row=make('div',null,'lineup-player'),image=make('img'),label=make('label',player.name),input=make('input');
   input.setAttribute('list','uma-options');input.placeholder='Search Uma or outfit';input.dataset.playerId=player.id;
   const card=match.lineup?.[player.id],uma=catalog.find(c=>c.card===card);
   input.value=uma?outfitLabel(uma):card?'Recorded outfit':'';input.dataset.card=String(card||'');
   input.disabled=!available||!!(started&&card);
   image.alt='';image.hidden=!card;if(card)image.src='/assets/cards/'+card+'.png';
   image.onerror=()=>{image.hidden=true;};
   input.oninput=()=>{
    dirty=true;$('save-lineup').disabled=false;const chosen=catalog.find(c=>outfitLabel(c)===input.value);
    input.dataset.card=String(chosen?.card||'');image.hidden=!chosen;if(chosen)image.src='/assets/cards/'+chosen.card+'.png';
    updateLineupCount(match.playerIds.length);
   };
   const dqLabel=make('label',null,'lineup-dq'),dq=make('input');
   dq.type='checkbox';dq.setAttribute('aria-label','Disqualified: '+player.name);
   dq.checked=match.disqualifiedPlayerIds?.includes(player.id)===true;
   dq.onchange=()=>{dirty=true;$('save-lineup').disabled=false;};
   dqLabel.append(dq,document.createTextNode('DQ'));
   label.append(input);row.append(image,label,dqLabel);group.append(row);
  }
  target.append(group);
 }
 updateLineupCount(match.playerIds.length);
 $('save-lineup').disabled=!state.matchLineups||!dirty;
 $('lineup-help').textContent=!state.matchLineups?'Open the desktop Helper shortcut to activate the update.':!catalog.length?'Uma list unavailable. Reload the desk.':'One Uma and outfit per trainer for the entire match.';
}
function outfitLabel(uma){return uma.name+' ('+uma.outfit+')';}
function updateLineupCount(total){
 const filled=[...$('lineup-players').querySelectorAll('input[data-player-id]')].filter(input=>input.dataset.card).length;
 $('lineup-count').textContent=filled+' / '+total;
}
lineups.onsubmit=async e=>{
 e.preventDefault();const button=$('save-lineup');button.disabled=true;
 try{
  const entries=[...$('lineup-players').querySelectorAll('input[data-player-id]')].map(input=>{
   if(input.value.trim()&&!input.dataset.card)throw Error('Choose a listed Uma and outfit for each filled player.');
   return {playerId:input.dataset.playerId,card:Number(input.dataset.card)||null,disqualified:input.closest('.lineup-player').querySelector('[type=checkbox]').checked};
  });
  const res=await fetch('/api/ops/lineup',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:lineupRevision,matchId:lineupMatch,entries})});
  const result=await res.json();
  if(res.status===409){dirty=false;document.dispatchEvent(new Event('opsrefresh'));throw Error('The lineup changed. Review the latest lineup and save again.');}
  if(!res.ok)throw Error(result.error);
  dirty=false;note('Match lineup saved.');document.dispatchEvent(new Event('opsrefresh'));
 }catch(err){note(err.message,true);}
 finally{button.disabled=!dirty;}
};
function render(next){state=next;renderGuide();if(revision===state.revision)return;revision=state.revision;rebuildLineup();}
document.addEventListener('opsstate',e=>render(e.detail));
document.addEventListener('deskselection',()=>rebuildLineup());
catalog=await outfitCatalog;
$('uma-options').replaceChildren(...catalog.map(uma=>new Option(outfitLabel(uma),outfitLabel(uma))));
try{render(await(await fetch('/api/ops/state')).json());rebuildLineup();}catch(e){note(e.message,true);}

await setupScenes();