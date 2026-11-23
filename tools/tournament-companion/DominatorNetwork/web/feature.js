const $=id=>document.getElementById(id);
const make=(tag,value,cls)=>{const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;};
const profile=location.pathname==='/uma-highlight';
$('scene').textContent=profile?'PLAYER SPOTLIGHT':'RACE RESULTS';
function fit(){$('canvas').style.transform='scale('+Math.min(innerWidth/1920,innerHeight/1080)+')';}
addEventListener('resize',fit);fit();
function results(data){
 const table=make('table'),head=table.createTHead().insertRow();
 for(const label of ['Place','Player','Umamusume','Team','Time','Points'])head.append(make('th',label));
 const body=table.createTBody();
 for(const r of data.rows){const tr=body.insertRow();for(const v of [r.rank,r.playerName,r.uma?.name||r.name,r.team,Number.isFinite(r.finishTime)?r.finishTime.toFixed(3)+' s':'—',r.points])tr.append(make('td',v??'—'));}
 return [make('h1',data.manual?'Official Podium':'Final Results'),table];
}
function values(title,entries){
 const group=make('div',null,'values');
 for(const [label,value] of Object.entries(entries)){const cell=make('span',label);cell.append(make('b',value));group.append(cell);}
 return group.children.length?[make('h2',title),group]:[];
}
function spotlight(d,page){
 const section=make('div',null,'profile'),art=make('img');art.alt='';if(d.uma.card){const portrait='/assets/cards/'+d.uma.card+'.png';art.src=d.uma.art||portrait;art.onerror=()=>{art.onerror=null;art.src=portrait;};}
 const detail=make('div',null,'detail');detail.append(make('h1',d.uma.name),make('p',[d.uma.outfit,d.player,d.team].filter(Boolean).join(' · ')),...values('Stats',d.stats),...values('Aptitudes',d.aptitudes));
 if(d.skills.length){const size=8,pages=Math.ceil(d.skills.length/size),group=make('div',null,'skills');
 detail.append(make('h2','Skills'+(pages>1?' · '+(page%pages+1)+' / '+pages:'')),group);
 for(const s of d.skills.slice(page%pages*size,(page%pages+1)*size))group.append(make('span',s.name+(s.level?' · Lv. '+s.level:'')));
 }
 if(!Object.keys(d.stats).length&&!Object.keys(d.aptitudes).length&&!d.skills.length)detail.append(make('p','Build details were not recorded in this capture.'));
 section.append(art,detail);return [section];
}
let signature='',start='',since=0;
async function poll(){try{const res=await fetch(profile?'/api/highlight':'/api/results',{cache:'no-store'});if(!res.ok)throw Error();
 const data=await res.json(),key=JSON.stringify(data);
 if(start!==key){start=key;since=Date.now();}
 const page=data?.skills?.length?Math.floor((Date.now()-since)/8000)%Math.ceil(data.skills.length/8):0;
 if(signature!==key+page){signature=key+page;$('context').textContent=data?[data.round,data.race].join(' · '):'';$('fixture').textContent=data?.match||'';
 $('content').replaceChildren(...(data?(profile?spotlight(data,page):results(data)):[make('p',profile?'Choose a runner on the Race Desk.':'Awaiting a finalized result for this race.','empty')]));}
 }catch{$('fixture').textContent='Helper disconnected';signature='';}setTimeout(poll,1200);}poll();
