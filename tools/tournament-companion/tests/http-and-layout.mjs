import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
// Consume every response, including image/error bodies, before closing the client.
const fetch=(url,options={})=>new Promise((resolve,reject)=>{const request=http.request(url,{method:options.method||'GET',headers:{...options.headers,...(options.body?{'Content-Length':Buffer.byteLength(options.body)}:{})}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));});request.on('error',reject);request.end(options.body);});
const model=await import('../DominatorNetwork/web/model.js');
for(const count of [1,9,12,18,32])for(const [w,h] of [[440,1080],[1920,1080],[440,720],[320,640]]){
 const f=model.fit(count,w,h);assert(f.height*f.scale<=h-24+.01);assert(400*f.scale<=w-24+.01);
}
let race=model.sampleRace(3,18,'all');assert.equal(race.runners.length,18);assert.equal(new Set(race.runners.map(r=>r.id)).size,18);assert.notEqual(race.runners.find(r=>r.card===100601).variant,race.runners.find(r=>r.card===100602).variant);
for(const row of race.runners){assert(Object.values(model.visibleLights(row,3)).every(Boolean));assert.equal(model.visibleLights(row,7).lateStart,false);assert(Object.values(model.visibleLights({...row,finished:true},3)).every(v=>!v));}
assert.equal(model.teamFor({trainer:'A',club:'Club'},{teams:{A:'Team'}}),'Team');
const base='http://127.0.0.1:27841';
let state=await(await fetch(base+'/api/state')).json();assert.equal(state.active,false);assert.equal(state.config.autoFit,true);
for(const path of ['/','/overlay','/model.js','/settings.js','/overlay.css','/assets/cards/100601.png','/assets/cards/100602.png'])assert.equal((await fetch(base+path)).status,200,path);
assert.equal((await fetch(base+'/%2e%2e%2fdominator.ini')).status,404);
assert.equal((await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
assert.equal((await fetch(base+'/api/state',{headers:{Host:'hostile.example'}})).status,403);
const config={...state.config,tournament:'TEST <script> & "quotes"',teams:{'Trainer Ω':'Club 水'},scale:99,motion:-1};
let response=await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json','Origin':base,'X-Dominator-Settings':'1'},body:JSON.stringify(config)});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.scale,2);assert.equal(saved.motion,80);assert.equal(saved.teams['Trainer Ω'],'Club 水');assert.equal(saved.tournament,config.tournament);
response=await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json','Origin':base,'X-Dominator-Settings':'1'},body:JSON.stringify(state.config)});assert.equal(response.status,200);
console.log('PASS: responsive fit, variant identity, dashboard expiry/finish, team mapping, HTTP assets/state, validated Unicode settings, origin/host restrictions and traversal rejection.');
if(process.argv[2]){
 const live=await(await fetch(process.argv[2]+'/api/state')).json();assert.equal(live.active,true);assert.equal(live.runners.length,1);
 const row=live.runners[0];assert.equal(row.card,100602);assert.equal(row.variant,'Ashen Miracle');assert.equal(row.trainer,'Trainer <test>');assert.equal(row.speed,72);assert.equal(row.paceMode,4);assert.equal(row.lights.paceUp,false);for(const key of ['rushed','blocked','lateStart','paceDown'])assert.equal(row.lights[key],true);
 console.log('PASS: active race HTTP serialization, exact variant, trainer escaping, speed units and live dashboard flags.');
 assert.equal(live.version,'0.5.0');assert.deepEqual(live.raceInfo,{track:'Nakayama',trackId:10005,distance:1600,surface:1,going:2,weather:2,season:4});
 assert.equal(row.hp,0);assert.equal(row.lights.stamina,true);
 assert.equal(Object.hasOwn(row,'skillEvent'),false);
 console.log('PASS: race details and zero-stamina serialization; skill event removed.');
}

