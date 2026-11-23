export async function setupScenes(){
const $=id=>document.getElementById(id);
const panel=document.createElement('section');panel.className='card';panel.innerHTML='<h2>Race Review</h2><label>Finalized race<select id="past-race"></select></label><div id="past-order"></div><h2>Uma Spotlight</h2><label>Import race JSON<input id="spotlight-file" type="file" accept=".json"></label><label>Imported file<select id="capture-source"></select></label><label>Runner<select id="highlight-runner"></select></label><button id="take-highlight">Show on broadcast</button><span role="status" id="highlight-status"></span>';
document.querySelector('.publish-card').before(panel);
let state,signature='',reviewRequest=0,runnerRequest=0;
let emailConnected=false;
const pendingMail=new Set(), mailStatus=new Map();
function drawMail(){
 const id=$('match-select').value;
 const series=state?.series.find(row=>row.id===id);
 $('email-match').disabled=!emailConnected||pendingMail.has(id)||!(series&&(series.raceCount||series.manualOverride||series.decision));
 $('email-status').textContent=mailStatus.get(id)||'';
}
function mailRequest(route,body){return json('/api/ops/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify(body)});}
$('email-connect').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
 try {await mailRequest('email-settings',{url:form.elements.url.value.trim(),key:form.elements.key.value.trim()});
  emailConnected=true;form.reset();$('email-connection').textContent='Sender connected.';drawMail();
 }catch(error){$('email-connection').textContent=error.message;}finally{button.disabled=false;}
};
$('email-match').onclick=async()=>{
 const id=$('match-select').value;if(!id||pendingMail.has(id))return;
 pendingMail.add(id);mailStatus.set(id,'Sending match…');drawMail();
 try{const result=await mailRequest('email-match',{matchId:id});
  mailStatus.set(id,result.alreadySent?'This export was already sent.':'Match sent to the organizer.');
 }catch(error){mailStatus.set(id,error.message);}finally{pendingMail.delete(id);drawMail();}
};
json('/api/ops/email-settings').then(result=>{emailConnected=result.configured;
 $('email-connection').textContent=emailConnected?'Sender connected.':'Connect the sender on this PC.';drawMail();
}).catch(error=>{$('email-connection').textContent=error.message;});
const fill=(sel,rows,placeholder)=>{const previous=sel.value;sel.replaceChildren(new Option(placeholder,''),...rows.map(([id,label])=>new Option(label,id)));if(rows.some(([id])=>id===previous))sel.value=previous;};
async function showReview(){const id=$('past-race').value,request=++reviewRequest,target=$('past-order');target.replaceChildren();if(!id)return;
 try{const result=await json('/api/ops/finalized?heat='+encodeURIComponent(id));if(request!==reviewRequest||!result)return;
 const list=document.createElement('ol');for(const r of result.rows){const li=document.createElement('li');li.textContent=[r.playerName,r.uma?.name||r.name,r.points+' pts'].filter(Boolean).join(' · ');list.append(li);}target.append(list);
 const heat=state.series.flatMap(s=>s.races).find(r=>r.heatId===id);
 const edit=document.createElement('button');edit.textContent='Edit result';
 edit.onclick=()=>{if(heat.manual)document.dispatchEvent(new CustomEvent('editmanual',{detail:heat.id}));else document.querySelector('[data-race-id="'+heat.id+'"]')?.click();};target.append(edit);
 const air=document.createElement('button');air.textContent=id===state.activeHeatId?'On air':'Broadcast this race';air.disabled=id===state.activeHeatId;
 air.onclick=()=>{$('heat-select').value=id;$('select-heat').click();};target.append(air);}
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
 const old=$('capture-source').value;fill($('capture-source'),state.races.filter(r=>r.status!=='void').map(r=>[r.id,r.filename]),'Choose a capture');
 if(!old&&state.highlight)$('capture-source').value=state.highlight.raceId;
 if(!old||old!==$('capture-source').value)runners();showReview();
 const allowed=series&&(series.raceCount||series.manualOverride||series.decision);$('export').hidden=!allowed;
 $('export').href='/api/ops/match-zip?match='+encodeURIComponent(id);$('publish-status').textContent=allowed?match.name:'Finalize a race to export this match.';
 drawMail();
}
$('spotlight-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>16*1024*1024)throw Error('File exceeds 16 MB.');
  const raw=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
  const imported=await json('/api/ops/import',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({race:raw,filename:file.name})});
  state=await json('/api/ops/state');draw();$('capture-source').value=imported.id;await runners();document.dispatchEvent(new Event('opsrefresh'));
 }catch(error){$('highlight-status').textContent=error.message;}finally{e.target.value='';}
};
$('past-race').onchange=showReview;$('capture-source').onchange=runners;$('highlight-runner').onchange=()=>{$('take-highlight').disabled=!$('highlight-runner').value;};
$('take-highlight').onclick=async()=>{try{await json('/api/ops/highlight',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:state.revision,raceId:$('capture-source').value,index:Number($('highlight-runner').value)})});$('highlight-status').textContent='Spotlight updated.';document.dispatchEvent(new Event('opsrefresh'));}catch(e){$('highlight-status').textContent=e.message;}};
const grid=document.querySelector('.source-grid');
for(const [title,url] of [['Race results','/race-result'],['Player spotlight','/uma-highlight']]){
 const box=document.createElement('div'),h=document.createElement('h3'),code=document.createElement('code'),btn=document.createElement('button');
 h.textContent=title;code.textContent=location.origin+url;btn.textContent='Preview';btn.onclick=()=>{$('obs-preview').classList.remove('race-preview');$('obs-preview').src=url;};box.append(h,code,btn);grid.append(box);
}
const stinger=document.createElement('div');stinger.innerHTML='<h3>Scene Transition</h3><a href="/stinger.webm" download="DDT2-stinger.webm">Download OBS stinger</a><p>In OBS, add a Stinger transition, choose this file and set the transition point to 850 ms.</p>';grid.append(stinger);
document.addEventListener('deskselection',draw);document.addEventListener('opsstate',e=>{state=e.detail;draw();});
state=await json('/api/ops/state');draw();
}
