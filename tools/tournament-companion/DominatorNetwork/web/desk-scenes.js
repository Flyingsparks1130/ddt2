export async function setupScenes(){
const $=id=>document.getElementById(id);
const panel=document.createElement('section');panel.className='card';panel.innerHTML='<h2>Race Review</h2><label>Finalized race<select id="past-race"></select></label><div id="past-order"></div><h2>Uma Spotlight</h2><label>Runner<select id="highlight-runner"></select></label><button id="take-highlight">Show on broadcast</button><span role="status" id="highlight-status"></span>';
document.querySelector('.publish-card').before(panel);
let state,signature='',reviewRequest=0;
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
function draw(){if(!state)return;const id=$('match-select').value,key=id+'|'+state.revision;if(key===signature)return;signature=key;
 const match=state.matches.find(m=>m.id===id),series=state.series.find(m=>m.id===id),heats=new Map(match?.heats.map(h=>[h.id,h.number])||[]);
 const label=n=>n===7?'Tiebreaker':'Race '+n;
 fill($('past-race'),(series?.races||[]).map(r=>[r.heatId,label(r.number)]),'Choose a finalized race');
 const roster=match?.spotlight,runner=$('highlight-runner');
 const previous=runner.dataset.capture;
 fill(runner,(roster?.choices||[]).map(row=>[String(row.index),[row.uma,row.player||'Gate '+row.gate].join(' · ')]),
  roster?'Choose an Uma':'Load the first race for this matchup');
 runner.dataset.capture=roster?.raceId||'';
 if(previous!==runner.dataset.capture)runner.value=state.highlight?.raceId===roster?.raceId&&roster?String(state.highlight.index):'';
 runner.disabled=!roster;$('take-highlight').disabled=runner.value==='';
 if(previous!==runner.dataset.capture)$('highlight-status').textContent='';
 showReview();
 const allowed=series?.status==='confirmed'&&series.teams.some(t=>t.id===series.winnerId&&t.points>=series.target);
 $('export').hidden=!allowed;
 if(allowed)$('export').href='/api/ops/match-zip?match='+encodeURIComponent(id);else $('export').removeAttribute('href');
 const manualCount=series?.races.filter(r=>r.manual).length||0;
 $('publish-status').textContent=allowed?match.name+' · '+(series.raceCount-manualCount)+' race files'+(manualCount?' · '+manualCount+' manual results without captures':''):'Confirm the matchup winner in Finalize to download.';
}
$('past-race').onchange=showReview;
$('highlight-runner').onchange=()=>{$('take-highlight').disabled=$('highlight-runner').value==='';};
$('take-highlight').onclick=async()=>{try{await json('/api/ops/highlight',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:state.revision,matchId:$('match-select').value,raceId:$('highlight-runner').dataset.capture,index:Number($('highlight-runner').value)})});$('highlight-status').textContent='Spotlight updated.';document.dispatchEvent(new Event('opsrefresh'));}catch(e){$('highlight-status').textContent=e.message;}};
const grid=document.querySelector('.source-grid');
for(const [title,url] of [['Race results','/race-result'],['Uma Spotlight','/uma-highlight']]){
 const box=document.createElement('div'),h=document.createElement('h3'),code=document.createElement('code'),btn=document.createElement('button');
 h.textContent=title;code.textContent=location.origin+url;btn.textContent='Preview';btn.onclick=()=>{$('obs-preview').classList.remove('race-preview');$('obs-preview').src=url;};box.append(h,code,btn);grid.append(box);
}
const stinger=document.createElement('div');stinger.innerHTML='<h3>Scene Transition</h3><a href="/stinger.webm" download="DDT2-stinger.webm">Download OBS stinger</a><p>In OBS, add a Stinger transition, choose this file and set the transition point to 850 ms.</p>';grid.append(stinger);
document.addEventListener('deskselection',draw);document.addEventListener('opsstate',e=>{state=e.detail;draw();});
state=await json('/api/ops/state');draw();
}
