import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nativeFetch=globalThis.fetch;
const fetch=(url,options={})=>nativeFetch(url,{...options,signal:AbortSignal.timeout(2000)});
test('native bridge and companion preserve the OBS feed and synchronize operator-selected headers',{timeout:30000},async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'dominator-bridge-')),root=path.join(temp,'root');
 await mkdir(root,{recursive:true});await cp(path.join(project,'DominatorNetwork/web'),path.join(root,'web'),{recursive:true});
 await writeFile(path.join(root,'obs-settings.json'),JSON.stringify({tournament:'ORIGINAL',scale:.85,compact:true}));
 const children=[];let logs='';
 const run=(exe,args)=>{const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);return child;};
 const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const port=await freePort(),bridgePort=await freePort();
 const base=`http://127.0.0.1:${port}`,native=`http://127.0.0.1:${bridgePort}`;
 const waitFor=async fn=>{for(let i=0;i<10;i++){try{const value=await fn();if(value)return value;}catch{}await delay(100);}throw Error('Service did not become ready: '+logs);};
 const post=async(route,body)=>{const state=await(await fetch(base+'/api/ops/state')).json();const res=await fetch(base+'/api/ops/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({...body,revision:state.revision})});assert.equal(res.status,200,await res.text());};
 try{
  const bridge=run(path.join(project,'ServerTest.exe'),[root,String(bridgePort),'--race-fixture']);
  run(process.execPath,[path.join(project,'DominatorNetwork/companion/app.mjs'),'--port',String(port),'--bridge-port',String(bridgePort),'--root',root,'--data',path.join(temp,'data')]);
  const live=await waitFor(async()=>{const r=await fetch(base+'/api/state');return r.ok?await r.json():null;});
  assert.equal(live.version,'0.6.6');assert.equal(live.active,true);assert.equal(live.runners.length,1);assert.equal(live.runners[0].variant,'Ashen Miracle');assert.equal(live.runners[0].lights.stamina,true);assert.equal(live.raceInfo.track,'Nakayama');assert.equal(live.config.scale,.85);
  for(const name of ['overlay.html','overlay.js','overlay.css','model.js']){const url=name==='overlay.html'?'/overlay':'/'+name;assert.equal(await(await fetch(base+url)).text(),await readFile(path.join(project,'DominatorNetwork/web',name),'utf8'));}
  await post('setup',{name:'Test Championship',players:[{id:'a',name:'Player A',gameName:'A',team:'Red'}],rules:null});
  await post('match',{name:'Red vs Blue',round:'Round 2',stage:'SF',heats:1,playerIds:['a']});
  const state=await(await fetch(base+'/api/ops/state')).json();await post('select',{heatId:state.matches[0].heats[0].id});
  const actual=await(await fetch(native+'/api/config')).json();assert.equal(actual.tournament,'Test Championship');assert.equal(actual.matchup,'Red vs Blue');assert.equal(actual.round,'Round 2 · HEAT 1');assert.equal(actual.stage,'SF');assert.equal(actual.compact,true);assert.equal(actual.scale,.85);
  bridge.kill();await waitFor(async()=>{const r=await fetch(base+'/api/state');return r.status===503;});assert.equal((await fetch(base+'/api/ops/state')).status,200);
 }finally{for(const child of children){if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}}}
});
