const $=id=>document.getElementById(id);
const make=(tag,value,cls)=>{const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;};
const profile=location.pathname==='/uma-highlight';
$('scene').textContent=profile?'PLAYER SPOTLIGHT':'RACE RESULTS';
function fit(){$('canvas').style.transform='scale('+Math.min(innerWidth/1920,innerHeight/1080)+')';}
addEventListener('resize',fit);fit();
function portrait(card) {
 const img=make('img',null,'result-portrait');
 img.alt='';
 if(card)img.src='/assets/cards/'+Number(card)+'.png';
 img.onerror=()=>img.style.visibility='hidden';
 return img;
}
function raceTime(seconds){
 if(!Number.isFinite(seconds))return '—';
 const ms=Math.round(seconds*1000);
 return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');
}
function results(data){
 const table=make('table',null,'finishers'),head=table.createTHead().insertRow();
 for(const label of ['Place','Portrait','Player','Umamusume','Team','Time','Points'])head.append(make('th',label));
 const body=table.createTBody();
 for(const r of data.rows){
  const tr=body.insertRow();tr.insertCell().textContent=r.rank;
  tr.insertCell().append(portrait(r.uma?.card));tr.insertCell().textContent=r.playerName||'—';
  const runner=tr.insertCell();runner.append(make('strong',r.uma?.name||r.name||'—'),make('small',r.uma?.outfit));
  const team=make('div',null,'team-cell');if(r.teamCard)team.append(portrait(r.teamCard));team.append(make('span',r.team));tr.insertCell().append(team);
  tr.insertCell().textContent=raceTime(r.finishTime);tr.insertCell().textContent=r.points??'—';
 }
 return [make('h1',data.manual?'Official Podium':data.match||'Finishing Order'),table];
}
function values(title,entries){
 const group=make('div',null,title==='Stats'?'stat-values':'grades');
 for(const [label,value] of Object.entries(entries)){
  const cell=make('div');cell.dataset.kind=label.toLowerCase();
  if(title==='Stats'){
   const icon=make('img');icon.alt='';icon.src='/assets/icons/stats/'+label.toLowerCase()+'.webp';
   const meter=make('meter');meter.min=0;meter.max=Math.max(2000,value);meter.value=value;
   cell.append(icon,make('span',label),meter,make('b',value));
  }else{const grade=make('b',value);grade.dataset.grade=value;cell.append(make('span',label),grade);}
  group.append(cell);
 }
 return group.children.length?[make('h2',title),group]:[];
}
function spotlight(d,page){
 const section=make('div',null,'profile'),art=make('img');art.alt='';if(d.uma.card){const portrait='/assets/cards/'+d.uma.card+'.png';art.src=d.uma.art||portrait;art.onerror=()=>{art.onerror=null;art.src=portrait;};}
 const detail=make('div',null,'detail');detail.append(make('h1',d.uma.name),make('p',[d.uma.outfit,d.player,d.team].filter(Boolean).join(' · ')),...values('Stats',d.stats),...values('Aptitudes',d.aptitudes));
 if(d.skills.length){const size=8,pages=Math.ceil(d.skills.length/size),group=make('div',null,'skills');
 detail.append(make('h2','Skills'+(pages>1?' · '+(page%pages+1)+' / '+pages:'')),group);
 for(const s of d.skills.slice(page%pages*size,(page%pages+1)*size)){
  const chip=make('span',null,'skill');chip.dataset.rarity=s.rarity??0;
  if(s.icon){const icon=make('img');icon.alt='';icon.src='/assets/icons/skills/'+s.icon+'.webp';chip.append(icon);}
  chip.append(make('strong',s.name),make('small',[Number(s.rarity)===6?'Evolved':'',s.level?'Lv. '+s.level:''].filter(Boolean).join(' · ')));group.append(chip);
 };
 }
 if(!Object.keys(d.stats).length&&!Object.keys(d.aptitudes).length&&!d.skills.length)detail.append(make('p','Build details were not recorded in this capture.'));
 section.append(art,detail);return [section];
}
let signature='',start='',since=0;
async function poll(){try{const res=await fetch(profile?'/api/highlight':'/api/results',{cache:'no-store'});if(!res.ok)throw Error();
 const data=await res.json(),key=JSON.stringify(data);
 if(start!==key){start=key;since=Date.now();}
 const page=data?.skills?.length?Math.floor((Date.now()-since)/8000)%Math.ceil(data.skills.length/8):0;
 if(signature!==key+page){signature=key+page;$('context').textContent=data?[data.round,data.race].filter(Boolean).join(' · '):'';$('fixture').textContent=data?.match||'';
 $('content').replaceChildren(...(data?(profile?spotlight(data,page):results(data)):[make('p',profile?'Choose a runner on the Race Desk.':'Awaiting a finalized result for this race.','empty')]));}
 }catch{$('fixture').textContent='Helper disconnected';signature='';}setTimeout(poll,1200);}poll();
