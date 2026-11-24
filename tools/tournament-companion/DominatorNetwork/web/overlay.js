import {styles,lamps,fit,visibleLights,sampleRace,podium,raceView,renderDensity,raceLabels} from './model.js';
const $=id=>document.getElementById(id),panel=$('panel'),nodes=new Map(),params=new URLSearchParams(location.search);
const demo=params.get('demo')==='1',count=Math.min(18,Math.max(1,Number(params.get('count'))||18)),testLamp=params.get('lamp')||'';
const density=renderDensity(params.get('renderScale'));
let data=null,lastResponse=0,raceId='',lastConfig={},lastDraw=0,lastCount=18,idleCount=0;
const paths={rushed:'M8 1 3 7h4l-1 4 6-7H8l1-3Z',stamina:'M1 3h11v7H1ZM12 5h2v3h-2M4 5v3',lateStart:'M8 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM8 3v3l2 1M6 0h4',blocked:'M2 2h12v8H2ZM4 3l3 6M9 3l3 6'};
function nodeFor(r){
 if(nodes.has(r.id))return nodes.get(r.id);
 const el=document.createElement('article');el.className='runner';
 el.innerHTML='<span class="rank"></span><div class="portrait-wrap"><img class="portrait" alt=""><span class="fallback" hidden></span></div><div class="identity-stack"><div class="identity"><span class="name"></span> <span class="variant"></span></div><div class="trainer"></div></div><div class="metrics"><span class="gate"></span><span class="style"></span><div class="numbers"><span class="gap"></span><span class="speed"></span></div><div class="lamps"></div></div>';
 const parts=Object.fromEntries(['rank','portrait','fallback','gate','name','variant','identity','identity-stack','trainer','gap','speed','style','lamps'].map(k=>[k,el.querySelector('.'+k)]));
 for(const [key,label,color] of lamps){const light=document.createElement('span');light.className='lamp';light.style.setProperty('--lamp',color);light.title=label;light.setAttribute('aria-label',label);light.innerHTML=`<svg viewBox="0 0 16 12" aria-hidden="true"><path d="${paths[key]}"></path></svg>`;parts.lamps.append(light);parts[key]=light;}
 parts.portrait.addEventListener('error',()=>{parts.portrait.hidden=true;parts.fallback.hidden=false;});
 $('runners').append(el);const item={el,parts,card:null,rank:r.rank,changed:0};nodes.set(r.id,item);return item;
}
function clearRoster(){nodes.clear();$('runners').replaceChildren();raceId='';idleCount=0;}
function idleRows(total,row){
 if(idleCount!==total){clearRoster();idleCount=total;for(let i=0;i<total;i++){const el=document.createElement('div');el.className='empty-row';el.setAttribute('aria-hidden','true');el.innerHTML='<span class="empty-pos"></span><span class="empty-portrait"></span><span class="empty-name"></span><span class="empty-player"></span>';el.style.transform=`translateY(${i*row}px)`;$('runners').append(el);}}
 else [...$('runners').children].forEach((el,i)=>el.style.transform=`translateY(${i*row}px)`);
}
let broadcastSeries=null,headerKey='';
function renderMatchup(label){
 const teams=broadcastSeries?.teams||[];
 const key=JSON.stringify([label,teams.map(t=>[t.id,t.name,t.representative?.card])]);
 if(key===headerKey)return;
 headerKey=key;
 const heading=$('matchup');
 heading.replaceChildren();
 if(teams.length!==2){heading.textContent=label;return;}
 for(const [i,team] of teams.entries()){
  if(i)heading.append(document.createTextNode(' vs '));
  const card=team.representative?.card;
  if(Number.isInteger(card)&&card>0){
   const img=document.createElement('img');img.className='team-portrait';
   img.alt='';img.onerror=()=>img.remove();img.src='/assets/cards/'+card+'.png';heading.append(img);
  }
  heading.append(document.createTextNode(team.name));
 }
}
async function pollMatchup(){
 try{
  const res=await fetch('/api/broadcast',{cache:'no-store',signal:AbortSignal.timeout(1500)});
  // The standalone game bridge serves telemetry only.
  if(res.status===404)return;
  if(!res.ok)throw Error();
  broadcastSeries=(await res.json()).series;
 }catch{broadcastSeries=null;}
 setTimeout(pollMatchup,2000);
}
if(!demo)pollMatchup();
function header(cfg,frame){
 panel.style.left=panel.style.top=`${12*density}px`;panel.style.transform=`scale(${frame.scale*density})`;
 panel.classList.toggle('compact',!!cfg.compact);panel.style.setProperty('--motion',`${cfg.motion||320}ms`);panel.style.setProperty('--opacity',cfg.opacity??1);
 const title=cfg.tournament||'DOMINATOR NETWORK';$('title').textContent=title;$('title').title=title;
 renderMatchup(cfg.matchup||'MATCHUP TBD');const heat=String(cfg.round||'').match(/(?:heat|race)\s+(\d+)/i);
 $('stage').textContent=heat?(Number(heat[1])===7?'Tiebreaker':'Race '+heat[1]):cfg.round||'Race pending';
 $('round').hidden=true;
}
function draw(state,cfg,connected=true){
 const view=raceView(state,connected,lastCount);panel.hidden=!view.visible||cfg.enabled===false;if(panel.hidden)return;
 if(view.live)lastCount=view.count;
 let rowHeight=0;panel.classList.toggle('compact',!!cfg.compact);
 if(view.live){
  if(idleCount||raceId!==state.raceId){clearRoster();raceId=state.raceId;}
  for(const r of state.runners){const p=nodeFor(r).parts;
   p.name.textContent=r.name;p.variant.textContent=r.variant?`(${r.variant})`:'';p.identity.title=r.name+(r.variant?` (${r.variant})`:'');
   p.trainer.textContent=(r.trainer||'Player unavailable').replace(/^@+/,'');p.trainer.title=r.creator&&r.creator!==r.trainer?`Player: ${r.trainer} · Owner: ${r.creator}`:p.trainer.textContent;
  }
  for(const r of state.runners)rowHeight=Math.max(rowHeight,nodes.get(r.id).parts['identity-stack'].offsetHeight+12);
 }
 const frame=fit(view.count,innerWidth/density,innerHeight/density,{...cfg,rowHeight});header(cfg,frame);panel.style.setProperty('--row-height',`${frame.row-3}px`);
 const info=raceLabels(view.live?state.raceInfo:{});for(const key of ['track','distance','surface','going','weather','season']){$('race-'+key).textContent=info[key];$('race-'+key).title=info[key];}
 $('runners').style.height=`${view.count*frame.row}px`;panel.classList.toggle('idle',!view.live);
 $('live').classList.toggle('sample',!!state?.demo);
 if(!view.live){
  if(nodes.size)clearRoster();idleRows(view.count,frame.row);
  $('live').textContent='WAITING FOR A RACE';$('count').textContent='GAME CONNECTED';$('remaining').textContent='READY FOR THE FIELD';$('progress').style.width='0%';return;
 }
 $('live').textContent=state.demo?'PREVIEW / SAMPLE DATA':state.paused?'RACE PAUSED':'LIVE POSITION TRACKER';
 const leader=Math.max(...state.runners.map(r=>r.distance)),present=new Set();
 state.runners.forEach((r,i)=>{
  present.add(r.id);const item=nodeFor(r),{el,parts:p}=item;
  if(item.rank!==r.rank){item.changed=performance.now();el.classList.toggle('rising',r.rank<item.rank);el.classList.toggle('falling',r.rank>item.rank);item.rank=r.rank;}
  if(performance.now()-item.changed>1400)el.classList.remove('rising','falling');
  el.style.transform=`translateY(${i*frame.row}px)`;el.style.zIndex=String(40-i);el.dataset.place=podium(r.rank);
  el.classList.toggle('finished',r.finished);
  p.rank.textContent=String(r.rank);p.gate.textContent=String(r.gate);p.gate.title=`Gate ${r.gate}`;p.gate.setAttribute('aria-label',`Gate ${r.gate}`);p.fallback.textContent=String(r.gate);
  if(item.card!==r.card){item.card=r.card;p.portrait.hidden=!r.card;p.fallback.hidden=!!r.card;if(r.card)p.portrait.src=`/assets/cards/${Number(r.card)}.png`;}
  p.gap.textContent=r.finished?'FIN':r.rank===1?'LEADER':`+${Math.max(0,leader-r.distance).toFixed(1)}m`;p.speed.textContent=Number(r.speed).toFixed(1);p.speed.title='km/h';
  const strategy=styles[r.style]||{name:'UNKNOWN',short:'?',color:'#c1aeb9'};p.style.textContent=strategy.short;p.style.title=strategy.name;p.style.setAttribute('aria-label',strategy.name);p.style.style.setProperty('--style',strategy.color);
  const lights=visibleLights(r,state.time);
  p.lamps.hidden=cfg.indicators===false;for(const [key] of lamps){p[key].classList.toggle('active',lights[key]);p[key].setAttribute('aria-pressed',String(lights[key]));}
  el.setAttribute('aria-label',`${r.rank}. ${p.identity.title}, ${p.trainer.textContent}, gate ${r.gate}, ${strategy.name}`);
 });
 for(const [id,node] of nodes)if(!present.has(id)){node.el.remove();nodes.delete(id);}
 $('count').textContent=`${state.runners.length} RUNNERS / ${state.runners.every(r=>r.finished)?'FINISH':state.paused?'PAUSED':'RACING'}`;
 $('remaining').textContent=state.course?`${Math.max(0,state.course-leader).toFixed(0)}m LEFT`:'--';$('progress').style.width=`${Math.min(100,Math.max(0,leader/(state.course||1)*100))}%`;
}
async function poll(){try{const response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(1200)});if(!response.ok)throw Error();data=await response.json();lastResponse=performance.now();lastConfig=data.config;}catch{}setTimeout(poll,50);}
function frame(now){if(now-lastDraw>45){lastDraw=now;if(demo)draw(sampleRace(now/1000,count,testLamp),Object.keys(lastConfig).length?lastConfig:{enabled:true,autoFit:true});else draw(data,lastConfig,!!data&&now-lastResponse<2000);}requestAnimationFrame(frame);}
poll();requestAnimationFrame(frame);
