import assert from 'node:assert/strict';
import {raceView,podium,fit,renderDensity,styles,sampleRace,visibleLights} from '../DominatorNetwork/web/model.js';
assert.deepEqual(raceView(null,false),{visible:false,live:false,count:18});
assert.deepEqual(raceView({active:false,runners:[]},true),{visible:true,live:false,count:18});
const race=sampleRace(3,9,'all');
assert.deepEqual(raceView(race,true),{visible:true,live:true,count:9});
assert.deepEqual(raceView({active:false,runners:[]},true,9),{visible:true,live:false,count:9});
assert.equal(raceView(race,false,9).visible,false);
assert.equal(raceView({active:true,runners:[]},true,9).live,false);
assert.deepEqual([1,2,3,4,18,0].map(podium),['1','2','3','field','field','field']);
assert.deepEqual(Object.values(styles).map(s=>s.short),['F','P','L','E']);
for(const count of [9,12,18])for(const compact of [false,true])for(const density of [1,2,3]){
 const standard=fit(count,440,1080,{compact}),high=fit(count,440*density/renderDensity(density),1080*density/renderDensity(density),{compact});
 assert.deepEqual(standard,high);
 assert(standard.height*standard.scale<=1056.01);
}
assert.equal(renderDensity(null),1);assert.equal(renderDensity('bad'),1);assert.equal(renderDensity(-1),1);assert.equal(renderDensity(99),3);
const early=sampleRace(3,18,'all'),later=sampleRace(8,18,'all');
assert(early.runners.some(r=>r.rank!==later.runners.find(n=>n.id===r.id).rank));
for(const row of early.runners){assert(Object.values(visibleLights(row,3)).every(Boolean));assert.equal(visibleLights(row,7).lateStart,false);assert(Object.values(visibleLights({...row,finished:true},3)).every(v=>!v));}
console.log('PASS: connected waiting panel, retained field size, offline hiding, podium ranks, style initials, equal-size high-density rendering, moving fixture and status expiry.');
