export async function setupScenes(){
const $=id=>document.getElementById(id);
const panel=document.createElement('section');panel.className='card';panel.innerHTML='<h2>Race Review</h2><label>Finalized race<select id="past-race"></select></label><div id="past-order"></div><h2>Player Spotlight</h2><label>Captured race<select id="capture-source"></select></label><label>Runner<select id="highlight-runner"></select></label><button id="take-highlight">Show on broadcast</button><span role="status" id="highlight-status"></span>';
document.querySelector('.publish-card').before(panel);
let state,signature='',reviewRequest=0,runnerRequest=0;
const fill=(sel,rows,placeholder)=>{const previous=sel.value;sel.replaceChildren(new Option(placeholder,''),...rows.map(([id,label])=>new Option(label,id)));if(rows.some(([id])=>id===previous))sel.value=previous;};
async function showReview(){const id=$('past-race').value,request=++reviewRequest,target=$('past-order');target.replaceChildren();if(!id)return;
 try{const result=await json('/api/ops/finalized?heat='+encodeURIComponent(id));if(request!==reviewRequest||!result)return;
 const list=document.createElement('ol');for(const r of result.rows){const li=document.createElement('li');li.textContent=[r.playerName,r.uma?.name||r.name,r.points+' pts'].filter(Boolean).join(' · ');list.append(li);}target.append(list);}
 catch(e){if(request===reviewRequest)target.textContent=e.message;}}
async function json(url,options){const r=await fetch(url,options),data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
async function runners(){const id=$('capture-source').value,request=++runnerRequest;fill($('highlight-runner'),[],'Choose a runner');$('take-highlight').disabled=true;if(!id)return;
 try{const r=await json('/api/ops/race/'+encodeURIComponent(id));if(request!==runnerRequest)return;
 fill($('highlight-runner'),r.review.rows.map(x=>[String(x.index),[x.name,x.playerName||x.trainer,'Gate '+x.gate].filter(Boolean).join(' · ')]),'Choose a runner');}
 catch(e){$('highlight-status').textContent=e.message;}}
function draw(){if(!state)return;const id=$('match-select').value,key=id+'|'+state.revision;if(key===signature)return;signature=key;
 const match=state.matches.find(m=>m.id===id),series=state.series.find(m=>m.id===id),heats=new Map(match?.heats.map(h=>[h.id,h.number])||[]);
 const label=n=>n===7?'Tiebreaker':'Race '+n;
 fill($('past-race'),(series?.races||[]).map(r=>[r.heatId,label(r.number)]),'Choose a finalized race');
 const old=$('capture-source').value;fill($('capture-source'),state.races.filter(r=>heats.has(r.heatId)&&r.status!=='void').map(r=>[r.id,label(heats.get(r.heatId))+' · '+r.filename]),'Choose a capture');
 if(!old||old!==$('capture-source').value)runners();showReview();
 const allowed=series&&(series.raceCount||series.manualOverride||series.decision);$('export').hidden=!allowed;
 $('export').href='/api/ops/match-zip?match='+encodeURIComponent(id);$('publish-status').textContent=allowed?match.name:'Finalize a race to export this match.';
}
$('past-race').onchange=showReview;$('capture-source').onchange=runners;$('highlight-runner').onchange=()=>{$('take-highlight').disabled=!$('highlight-runner').value;};
$('take-highlight').onclick=async()=>{try{await json('/api/ops/highlight',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:state.revision,raceId:$('capture-source').value,index:Number($('highlight-runner').value)})});$('highlight-status').textContent='Spotlight updated.';document.dispatchEvent(new Event('opsrefresh'));}catch(e){$('highlight-status').textContent=e.message;}};
const grid=document.querySelector('.source-grid');
for(const [title,url] of [['Race results','/race-result'],['Player spotlight','/uma-highlight']]){
 const box=document.createElement('div'),h=document.createElement('h3'),code=document.createElement('code'),btn=document.createElement('button');
 h.textContent=title;code.textContent=location.origin+url;btn.textContent='Preview';btn.onclick=()=>{$('obs-preview').classList.remove('race-preview');$('obs-preview').src=url;};box.append(h,code,btn);grid.append(box);
}
const stinger=document.createElement('div');stinger.innerHTML='<h3>Scene Transition</h3><a href="/stinger.webm" download="DDT2-stinger.webm">Download OBS stinger</a><p>In OBS, add a Stinger transition, choose this file and set the transition point to 500 ms.</p>';grid.append(stinger);
document.addEventListener('deskselection',draw);document.addEventListener('opsstate',e=>{state=e.detail;draw();});
state=await json('/api/ops/state');draw();
}
