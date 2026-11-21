import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {initialState,readRace,rulesFrom,totals,publicBundle,digest,reviewRace} from '../DominatorNetwork/companion/domain.mjs';
import {publishBundle,targetFrom} from '../DominatorNetwork/companion/github.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=(seed=1)=>({raceType:'Practice',randomSeed:seed,raceCourseSet:{raceTrackId:10005,distance:1200,ground:1},groundCondition:'Soft',weather:'Cloudy',season:'Winter',raceHorse:[
 {charaName:'Oguri Cap',trainerName:'Alpha',finishOrder:2,finishTimeRaw:70.8,postNumber:1,responseHorseData:{card_id:100601,frame_order:1,running_style:2,trainer_name:'WRONG RECORDER'}},
 {charaName:'Oguri Cap',trainerName:'Beta',finishOrder:0,finishTimeRaw:70.1,postNumber:2,responseHorseData:{card_id:100602,frame_order:2,running_style:3}},
 {charaName:'Gold Ship',trainerName:'Alpha',finishOrder:1,finishTimeRaw:70.3,postNumber:2,responseHorseData:{card_id:100701,frame_order:3,running_style:4}}]});
test('horseACT normalization preserves official order, variants, entrant identity, frame gates and semantic deduplication',()=>{
 const race=readRace(fixture());assert.deepEqual(race.runners.map(r=>r.rank),[1,2,3]);assert.equal(race.runners[2].trainer,'Alpha');assert.deepEqual(race.runners.map(r=>r.gate),[2,3,1]);assert.equal(race.track.going,2);
 assert.equal(race.fingerprint,readRace(JSON.parse(JSON.stringify(fixture(),null,4))).fingerprint);assert.notEqual(race.fingerprint,readRace(fixture(2)).fingerprint);
 const missing=fixture();missing.raceHorse[1].finishOrder=2;assert.throws(()=>readRace(missing),/incomplete/);assert.throws(()=>rulesFrom({points:[NaN],tiebreak:'shared'}));
});
test('shared ties and countback produce sporting ranks; drafts never enter public data',()=>{
 const rows=[{playerId:'a',playerName:'A',team:'Red',rank:1,points:10},{playerId:'b',playerName:'B',team:'Blue',rank:2,points:10}];
 assert.deepEqual(totals([{rows}],'player','shared').map(r=>r.rank),[1,1]);assert.deepEqual(totals([{rows}],'player','countback').map(r=>r.rank),[1,2]);
 const state=initialState();state.races=[{status:'pending',runners:[{secret:'future winner'}]}];assert.equal(publicBundle(state).results.length,0);
});

test('wrong entrants and course mismatches block scoring approval; explicit participant mapping resolves aliases',()=>{
 const state=initialState('Fixture tournament');state.tournament.players=[{id:'a',name:'Alice',gameName:'Alias A',team:'Red'},{id:'b',name:'Bob',gameName:'Beta',team:'Blue'}];state.tournament.rules=rulesFrom({points:[10,6,3],tiebreak:'shared'});
 state.matches=[{id:'match',name:'Fixture match',round:'Round 1',stage:'QF',playerIds:['a','b'],expected:{distance:1600,surface:2,trackId:10001},heats:[{id:'heat',number:1}]}];
 const race={...readRace(fixture()),id:'race',heatId:'heat',status:'pending',mapping:{}};state.races=[race];
 let review=reviewRace(state,race);assert(!review.canApprove);assert(review.problems.some(p=>p.includes('Missing participant: Alice')));assert(review.problems.some(p=>p.includes('1600')));assert(review.problems.some(p=>p.includes('surface')));assert(review.problems.some(p=>p.includes('Racecourse')));
 state.matches[0].expected={distance:1200,surface:1,trackId:10005};race.mapping={0:'a',2:'a'};review=reviewRace(state,race);assert(review.canApprove);assert.deepEqual(totals([{rows:review.rows}],'team','shared').map(t=>[t.name,t.points]),[['Blue',10],['Red',9]]);
});
test('GitHub publishes one reviewed file with compare-and-swap; refuses unrelated content and reconciles timeouts',async()=>{
 const bundle=publicBundle(initialState('Test')),target=targetFrom({owner:'example',repo:'tournament',branch:'main',file:'data/tournament.json'}),calls=[];
 let saved=null;
 const fake=async(url,request)=>{calls.push({url,request});if(request.method==='PUT'){const body=JSON.parse(request.body);assert.equal(body.branch,'main');saved=JSON.parse(Buffer.from(body.content,'base64'));return new Response(JSON.stringify({commit:{sha:'commit1'},content:{html_url:'https://github.com/example/tournament/blob/main/data/tournament.json'}}),{status:201});}return new Response('',{status:404});};
 const result=await publishBundle(target,bundle,'test-token',fake);assert.equal(result.commit,'commit1');assert.deepEqual(saved,bundle);assert.equal(calls.filter(c=>c.request.method==='PUT').length,1);
 await assert.rejects(()=>publishBundle(target,bundle,'test-token',async()=>new Response(JSON.stringify({type:'file',encoding:'base64',content:Buffer.from('{"unrelated":true}').toString('base64'),sha:'old'}))),/another file/);
 let committed=false;const retry=await publishBundle(target,bundle,'test-token',async(url,request)=>{if(request.method==='PUT'){committed=true;throw Error('Network timeout');}return committed?new Response(JSON.stringify({type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(bundle)).toString('base64'),sha:'saved',html_url:'https://github.com/example/tournament'})):new Response('',{status:404});});assert(retry.reconciled);
 assert.throws(()=>targetFrom({...target,file:'../index.html'}));
});
test('operations integration: scoring, approval gate, duplicate/rerun safety, watch staging, restart and approved-only exports',{timeout:60000},async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'dominator-run-')),root=path.join(temp,'root'),data=path.join(temp,'data'),watch=path.join(temp,'races');await mkdir(watch,{recursive:true});await mkdir(root,{recursive:true});
 await cp(path.join(project,'DominatorNetwork','web'),path.join(root,'web'),{recursive:true});await writeFile(path.join(root,'obs-settings.json'),JSON.stringify({tournament:'ORIGINAL',compact:true,scale:.85,teams:{Keep:'Existing'}}));
 const base='http://127.0.0.1:27841';let processHandle,logs='';
 const start=async()=>{processHandle=spawn(process.execPath,[path.join(project,'DominatorNetwork','companion','app.mjs'),'--port','27841','--bridge-port','27842','--root',root,'--data',data],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DOMINATOR_GITHUB_TOKEN:''}});processHandle.stdout.on('data',b=>logs+=b);processHandle.stderr.on('data',b=>logs+=b);for(let i=0;i<60;i++){try{const res=await fetch(base+'/api/ops/state');if(res.ok)return;}catch{}await delay(100);}throw Error('Companion startup failed: '+logs);};
 const stop=async()=>{if(processHandle&&processHandle.exitCode===null){const exited=new Promise(resolve=>processHandle.once('exit',resolve));processHandle.kill();await exited;}};
 const get=async route=>{const res=await fetch(base+'/api/ops/'+route);assert.equal(res.status,200);return res.json();};
 const post=async(route,body={},expected=200)=>{const state=await get('state');const res=await fetch(base+'/api/ops/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({revision:state.revision,...body})});const result=await res.json();assert.equal(res.status,expected,JSON.stringify(result));return result;};
 try{await start();let state=await get('state');assert.equal(state.tournament.rules,null);assert.equal(state.publication.ready,false);assert.equal((await fetch(base+'/api/state')).status,503);
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/ops/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const players=[{id:'alice',name:'Alice',gameName:'Alpha',team:'Red'},{id:'bob',name:'Bob',gameName:'Beta',team:'Blue'}];await post('setup',{name:'Crown Cup',players,rules:null});
  await post('match',{name:'Red vs Blue',round:'Round 1',stage:'QF',heats:2,playerIds:['alice','bob'],expected:{distance:1200,surface:1}});state=await get('state');const heats=state.matches[0].heats;await post('select',{heatId:heats[0].id});
  const config=JSON.parse(await readFile(path.join(root,'obs-settings.json'),'utf8'));assert.equal(config.matchup,'Red vs Blue');assert.equal(config.compact,true);assert.equal(config.scale,.85);
  const first=await post('import',{race:fixture(),filename:'race.json',heatId:heats[0].id});let detail=await get('race/'+first.id);assert(detail.review.problems.includes('Scoring format is not configured.'));
  await post('approve',{raceId:first.id,reviewHash:detail.review.hash,broadcastFinished:true,operator:'Ops'},400);
  await post('setup',{name:'Crown Cup',players,rules:{points:[10,6,3],tiebreak:'shared'}});detail=await get('race/'+first.id);assert(detail.review.canApprove);
  await post('approve',{raceId:first.id,reviewHash:detail.review.hash,broadcastFinished:false,operator:'Ops'},400);
  await post('approve',{raceId:first.id,reviewHash:'stale',broadcastFinished:true,operator:'Ops'},409);
  await post('approve',{raceId:first.id,reviewHash:detail.review.hash,broadcastFinished:true,operator:'Ops'});
  let bundle=await get('export');assert.equal(bundle.results.length,1);assert.deepEqual(bundle.standings.players.map(p=>[p.name,p.points]),[['Bob',10],['Alice',9]]);
  const duplicate=await post('import',{race:fixture(),filename:'renamed.json',heatId:heats[1].id});assert(duplicate.duplicate);assert.equal(duplicate.id,first.id);
  const rerun=await post('import',{race:fixture(2),filename:'rerun.json',heatId:heats[0].id});detail=await get('race/'+rerun.id);assert(detail.review.problems.some(p=>p.includes('already has')));assert.equal((await get('export')).results.length,1);
  await post('setup',{name:'Changed',players,rules:{points:[99],tiebreak:'shared'}},400);
  const publication=await get('publication');await post('publish',{hash:publication.hash,targetHash:publication.targetHash},400);assert.equal((await get('state')).publications.length,0);
  await post('void',{raceId:first.id,reason:'Rerun ordered'});detail=await get('race/'+rerun.id);await post('approve',{raceId:rerun.id,reviewHash:detail.review.hash,broadcastFinished:true,operator:'Ops'});assert.equal((await get('export')).results[0].raceId,rerun.id);
  await post('select',{heatId:heats[1].id});await writeFile(path.join(watch,'historical.json'),JSON.stringify(fixture(3)));await post('watch',{folder:watch,enabled:true});await post('arm');
  await writeFile(path.join(watch,'new.json'),'{');await delay(2300);await writeFile(path.join(watch,'new.json'),JSON.stringify(fixture(4)));
  let found;for(let i=0;i<55;i++){await delay(200);state=await get('state');found=state.races.find(r=>r.filename==='new.json');if(found)break;}assert(found,'Complete new file should reach inbox');assert.equal(found.heatId,heats[1].id);assert.equal(found.status,'pending');assert(!state.races.some(r=>r.filename==='historical.json'));assert.equal(state.armedHeatId,null);
  await stop();await start();state=await get('state');assert.equal(state.races.find(r=>r.id===rerun.id).status,'approved');assert.equal(state.activeHeatId,heats[1].id);assert.equal((await get('export')).results.length,1);
 }finally{await stop();}
});
