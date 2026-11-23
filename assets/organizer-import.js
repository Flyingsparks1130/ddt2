const $=id=>document.getElementById(id);
let payload='',ticket=0;
async function readZip(file){
 if(!file||file.size>47000)throw Error('Choose a single-match Helper ZIP under 47 KB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer),decoder=new TextDecoder();
 if(bytes.length<52||view.getUint32(0,true)!==0x04034b50||view.getUint16(8,true)!==8)throw Error('Choose an original Helper match ZIP.');
 const size=view.getUint32(18,true),expanded=view.getUint32(22,true),nameLength=view.getUint16(26,true),offset=30+nameLength+view.getUint16(28,true);
 if(expanded>1000000||offset+size>bytes.length||decoder.decode(bytes.slice(30,30+nameLength))!=='approved-results.json')throw Error('Invalid match package.');
 const stream=new Blob([bytes.slice(offset,offset+size)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 const reader=stream.getReader(),parts=[];let length=0;
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>expanded){await reader.cancel();throw Error('Invalid ZIP size.');}parts.push(value);}
 if(length!==expanded)throw Error('Incomplete ZIP.');
 return {bytes,bundle:JSON.parse(await new Blob(parts).text())};
}
async function preview(file){const request=++ticket;payload='';$('publish').disabled=true;$('confirm').hidden=true;$('review').textContent='';$('status').textContent='Reading ZIP…';
 try{const {bytes,bundle}=await readZip(file);
 const [index,feed]=await Promise.all(['data/tournament-index.json','data/companion/approved-results.json'].map(url=>fetch(url,{cache:'no-store'})));
 if(!index.ok||(!feed.ok&&feed.status!==404))throw Error('Could not load the current bracket.');
 const previous=feed.ok?await feed.json():null,{fixture}=DDT2Package.merge(await index.json(),previous,bundle);
 if(request!==ticket)return;const m=fixture.companion_series;
 $('review').textContent=[m.name,...m.teams.map(t=>t.name+' · '+t.points+' points'),m.races.map(r=>r.number===7?'Tiebreaker':'Race '+r.number).join(', '),m.winnerId?'Confirmed winner: '+m.teams.find(t=>t.id===m.winnerId).name:'Winner pending'].join('\n');
 payload=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));$('confirm').hidden=false;$('publish').disabled=!$('token').value.trim();$('status').textContent='';
 }catch(e){if(request===ticket)$('status').textContent=e.message;}}
$('zip').onchange=e=>preview(e.target.files[0]);$('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();preview(e.dataTransfer.files[0]);};
$('token').oninput=()=>{$('publish').disabled=!payload||!$('token').value.trim();};
$('publish').onclick=async()=>{if(!payload)return;const zip=payload,token=$('token').value.trim();$('token').value='';$('publish').disabled=true;
 try{const res=await fetch('https://api.github.com/repos/Flyingsparks1130/ddt2/actions/workflows/import-match.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({ref:'main',inputs:{package:zip}})});
 if(!res.ok)throw Error('GitHub declined the import ('+res.status+').');$('status').textContent='Import submitted. Open import history to check publication.';}catch(e){$('status').textContent=e.message;}};
