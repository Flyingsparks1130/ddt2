/* Interactive rule illustrations. These examples never read or change match results. */
(function(global){
 'use strict';
 const steps=[
  {label:'Tiebreaker',title:'Tiebreaker track',copy:'The draft opens with a randomly drawn tiebreaker track, revealed to both teams.'},
  {label:'Tracks',title:'Track selection',copy:'Each team chooses four tracks from the random pool, then bans one track chosen by the other team. The six remaining tracks make up the match schedule, with the tiebreaker held in reserve.'},
  {label:'Pre-bans',title:'Uma pre-bans',copy:'Each team bans one Uma. Neither Uma can be picked during the draft.'},
  {label:'Selections',title:'Uma selection',copy:'Teams draft five Umas each in snake order, then ban one Uma from the opposing team’s picks. Each team then drafts two more Umas, leaving six per team.'},
  {label:'Lineup',title:'Final lineups',copy:'Each team assigns five of its six Umas to its trainers, one per trainer. The remaining Uma is benched and does not race.'},
  {label:'Training',title:'Training and submission',copy:'After the draft, teams have 24 hours to train their Umas and submit their builds.'}
 ];
 const points=[4,2,1],podium=['a','b','b'],seen=new Set();
 let active=0,expanded=false,observer;
 const reduced=()=>Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
 const ease='cubic-bezier(.22,1,.36,1)';
 const crown='<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m5 12 7 8 8-14 8 14 7-8-5 20H10Z M12 27h16"/></svg>';
 const circuit='<svg class="guide-circuit" viewBox="0 0 440 230" fill="none"><rect x="32" y="30" width="376" height="170" rx="85"/><rect x="46" y="44" width="348" height="142" rx="71"/><rect x="60" y="58" width="320" height="114" rx="57"/><path class="guide-track-line" d="M220 186H117a71 71 0 0 1 0-142h206a71 71 0 0 1 0 142H220" pathLength="1"/><path class="guide-finish" d="M220 166v36M228 166v36"/><circle cx="220" cy="186" r="5"/></svg>';
 const token=(n,extra='')=>`<span class="guide-token ${extra}">${crown}<b>${n}</b></span>`;
 function illustration(i){
  if(i===0)return `<div class="guide-track">${circuit}<div class="guide-track-caption"><small>Drawn first</small><strong>Tiebreaker</strong><span>Held in reserve</span></div></div>`;
  if(i===1)return `<div class="guide-track-picks">${['A','B'].map(t=>`<div><span class="guide-team-label">Team ${t}</span><div class="guide-ticket-row">${[1,2,3,4].map(n=>`<span class="guide-ticket ${n===4?'is-banned':''}"><small>Track</small><b>${t}${n}</b>${n===4?'<i>Veto</i>':''}</span>`).join('')}</div></div>`).join('')}<p><strong>6</strong> race tracks <span>+ tiebreaker</span></p></div>`;
  if(i===2)return `<div class="guide-prebans">${['A','B'].map(t=>`<div><span class="guide-team-label">Team ${t}</span><div class="guide-ban-card">${crown}<span>Uma</span><b>Banned</b></div></div>`).join('')}<p>Two Umas removed before selection</p></div>`;
  if(i===3)return `<div class="guide-selection"><div class="guide-selection-formula"><span><b>5</b>picked</span><i>−</i><span class="is-ban"><b>1</b>banned</span><i>+</i><span><b>2</b>added</span><i>=</i><span class="is-total"><b>6</b>Umas</span></div><div class="guide-token-row">${[1,2,3,4,5,6].map(n=>token(n,n>4?'is-added':'')).join('')}</div><p>Each team finishes with six Umas</p></div>`;
  if(i===4)return `<div class="guide-lineup"><div class="guide-lineup-active"><span class="guide-team-label">Five trainers · five Umas</span><div class="guide-token-row">${[1,2,3,4,5].map(n=>token(n)).join('')}</div><span class="guide-lineup-rule">Race lineup</span></div><div class="guide-bench">${token(6)}<span>Benched</span></div></div>`;
  return `<div class="guide-training"><div class="guide-clock"><svg viewBox="0 0 200 200" fill="none"><circle cx="100" cy="100" r="88"/><circle class="guide-clock-ring" cx="100" cy="100" r="88" pathLength="1"/><path d="M100 5v14M195 100h-14M100 195v-14M5 100h14"/></svg><div><strong>24</strong><span>hours</span></div></div><div class="guide-training-steps"><span>Train in Unity Cup</span><span>Submit your build</span><strong>Use it on every track</strong></div></div>`;
 }
 function stage(){return `<div class="guide-illustration" aria-hidden="true" data-guide-scene="${active}">${illustration(active)}</div><div class="guide-stage-copy" aria-live="polite" aria-atomic="true"><h3>${steps[active].title}</h3><p>${steps[active].copy}</p></div>`;}
 function walkthrough(){return `<section class="season-section" id="draft-process"><div class="guide-section-heading"><h2>The draft process</h2><span>Explore each stage</span></div><div class="guide-walkthrough"><div class="guide-step-list" role="group" aria-label="Draft stages">${steps.map((s,i)=>`<button type="button" data-guide-step="${i}" aria-pressed="${i===active}" aria-controls="draft-stage"><span>${String(i+1).padStart(2,'0')}</span>${s.label}<b aria-hidden="true">↗</b></button>`).join('')}</div><div class="guide-stage-wrap"><div id="draft-stage">${stage()}</div><div class="guide-controls"><span data-guide-position>Stage ${active+1} of 6</span><div><button type="button" data-guide-move="-1" ${active===0?'disabled':''} aria-label="Previous draft stage">←</button><button type="button" data-guide-move="1" ${active===5?'disabled':''} aria-label="Next draft stage">→</button></div></div></div></div><details class="guide-transcript" ${expanded?'open':''}><summary>Read all draft steps <span aria-hidden="true">+</span></summary><ol class="matchday-rule-steps">${steps.map(s=>`<li><h3>${s.title}</h3><p>${s.copy}</p></li>`).join('')}</ol></details></section>`;}
 function totals(places){return places.reduce((out,team,i)=>{if((team==='a'||team==='b')&&i<3)out[team]+=points[i];return out;},{a:0,b:0});}
 function scoring(){const score=totals(podium);return `<section class="guide-scoring season-section" id="scoring-example"><div class="guide-section-heading"><h2>Scoring example</h2><span>Choose a team for each podium place.</span></div><div class="guide-score-layout"><div class="guide-podium">${['1st','2nd','3rd'].map((place,i)=>`<fieldset><legend><strong>${place}</strong><span>${points[i]} ${points[i]===1?'point':'points'}</span></legend><div>${['a','b'].map(t=>`<button type="button" data-score-place="${i}" data-score-team="${t}" aria-pressed="${podium[i]===t}">Team ${t.toUpperCase()}</button>`).join('')}</div></fieldset>`).join('')}</div><div class="guide-scoreboard"><p class="guide-score-caption">Points from this race</p>${['a','b'].map(t=>`<div class="guide-score-lane" data-score-lane="${t}" style="--score:${score[t]/7}"><div><span>Team ${t.toUpperCase()}</span><strong data-score-total="${t}">${score[t]}</strong></div><div class="guide-score-track" aria-hidden="true"><i></i><b></b></div></div>`).join('')}<p class="guide-score-explainer">Seven points are shared between the top three finishers.</p><p class="guide-announcement" role="status" data-score-announcement>Team A: ${score.a} points. Team B: ${score.b} points.</p></div></div></section>`;}
 function invitation(){return `<a class="guide-invitation" href="rules.html#draft-process"><div class="guide-invitation-track" aria-hidden="true">${circuit}</div><div><span>The format</span><h2>The draft, step by step</h2><p>Explore track picks, Uma selections and final lineups.</p></div><b aria-hidden="true">↗</b></a>`;}
 function choose(root,index){
  if(!Number.isInteger(index)||index<0||index>=steps.length||index===active)return;
  const direction=index>active?1:-1;active=index;
  const panel=root.querySelector('#draft-stage');if(!panel)return;
  panel.getAnimations?.({subtree:true}).forEach(a=>a.cancel());panel.innerHTML=stage();
  root.querySelectorAll('[data-guide-step]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.guideStep)===active)));
  root.querySelectorAll('[data-guide-move]').forEach(b=>b.disabled=active+Number(b.dataset.guideMove)<0||active+Number(b.dataset.guideMove)>=steps.length);
  root.querySelector('[data-guide-position]').textContent=`Stage ${active+1} of 6`;
  if(!reduced()){
   const art=panel.querySelector('.guide-illustration');
   art?.animate([{opacity:.3,transform:`translateX(${direction*12}px)`},{opacity:1,transform:'none'}],{duration:360,easing:ease});
   if(active===0)art?.querySelector?.('.guide-track-line')?.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:700,easing:ease});
   if(active===2)(art?.querySelectorAll?.('.guide-ban-card>b')||[]).forEach(stamp=>stamp.animate([{opacity:0,transform:'rotate(-18deg) scale(1.15)'},{opacity:1,transform:'rotate(-18deg)'}],{duration:420,easing:ease}));
   if(active===3)(art?.querySelectorAll?.('.is-added')||[]).forEach((card,i)=>card.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:420,delay:i*50,easing:ease}));
   if(active===5)art?.querySelector?.('.guide-clock-ring')?.animate([{strokeDasharray:'0 1'},{strokeDasharray:'.96 .04'}],{duration:700,easing:ease});
  }
 }
 function updateScore(root,place,team){
  if(!Number.isInteger(place)||place<0||place>2||!['a','b'].includes(team)||podium[place]===team)return;
  podium[place]=team;const score=totals(podium);
  root.querySelectorAll('[data-score-place]').forEach(b=>b.setAttribute('aria-pressed',String(podium[Number(b.dataset.scorePlace)]===b.dataset.scoreTeam)));
  ['a','b'].forEach(t=>{root.querySelector(`[data-score-total="${t}"]`).textContent=score[t];root.querySelector(`[data-score-lane="${t}"]`).style.setProperty('--score',score[t]/7);});
  root.querySelector('[data-score-announcement]').textContent=`Team A: ${score.a} points. Team B: ${score.b} points.`;
 }
 function bind(root){
  root.addEventListener('click',e=>{
   const step=e.target.closest('[data-guide-step]'),move=e.target.closest('[data-guide-move]'),score=e.target.closest('[data-score-place]');
   if(step)choose(root,Number(step.dataset.guideStep));
   if(move)choose(root,active+Number(move.dataset.guideMove));
   if(score)updateScore(root,Number(score.dataset.scorePlace),score.dataset.scoreTeam);
  });
  root.addEventListener('keydown',e=>{
   const step=e.target.closest('[data-guide-step]');if(!step||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
   e.preventDefault();const i=Number(step.dataset.guideStep),next=e.key==='Home'?0:e.key==='End'?5:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+6)%6;
   root.querySelectorAll('[data-guide-step]')[next].focus({preventScroll:true});choose(root,next);
  });
  root.addEventListener('toggle',e=>{if(e.target.classList?.contains('guide-transcript'))expanded=e.target.open;},true);
 }
 function present(root,page){
  observer?.disconnect();
  if(reduced()||!global.IntersectionObserver)return;
  observer=new global.IntersectionObserver(entries=>entries.forEach(entry=>{
   if(!entry.isIntersecting)return;
   const el=entry.target;seen.add(el.dataset.guideReveal);observer.unobserve(el);
   if(!reduced())el.animate([{opacity:.65,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:420,easing:ease});
  }),{threshold:.12});
  root.querySelectorAll('.season-entry,.season-stat-panel,.guide-invitation,.guide-scoring,.matchday-lineup').forEach((el,i)=>{
   const key=page+':'+i;if(seen.has(key))return;
   if(el.getBoundingClientRect().top<(global.innerHeight||0)){seen.add(key);return;}
   el.dataset.guideReveal=key;observer.observe(el);
  });
 }
 const api={walkthrough,scoring,invitation,totals,bind,present};global.DDT2Guide=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
