import assert from 'node:assert/strict';
import {lamps,sampleRace,visibleLights,raceLabels,fit} from '../DominatorNetwork/web/model.js';
assert.deepEqual(lamps.map(([key])=>key),['rushed','stamina','lateStart','blocked']);
assert.deepEqual(raceLabels({track:'Nakayama',distance:2500,surface:1,going:2,weather:2,season:4}),{track:'Nakayama',distance:'2500 m',surface:'Turf',going:'Good',weather:'Cloudy',season:'Winter'});
assert.equal(raceLabels({surface:2,going:4,season:5}).going,'Heavy');
assert.equal(raceLabels({trackId:98765}).track,'Track 98765');
assert.equal(raceLabels({weather:999}).weather,'WEATHER TBD');
for(const count of [9,12,18])for(const compact of [true,false]){
 const sample=sampleRace(3,count,'stamina');
 for(const r of sample.runners){assert(visibleLights(r,3).stamina);assert(!visibleLights({...r,finished:true},3).stamina);assert.equal(Object.keys(visibleLights(r,3)).length,4);}
 for(const rowHeight of [0,76,120]){const f=fit(count,440,1080,{compact,rowHeight});assert(f.row>=rowHeight);assert(f.height*f.scale<=1056.01);}
}
console.log('PASS: exactly four indicators, stamina finish clearing, race labels and unknown fallbacks, dynamic row fitting.');
