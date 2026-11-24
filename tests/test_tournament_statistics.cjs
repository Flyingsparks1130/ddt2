'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),S=require('../scripts/tournament_statistics.cjs');
const row={eligible:true,team_id:'a',owner:'Ada',uma:'Uma',variant_id:100101,build_fingerprint:'build-a',stats:{speed:1000,stamina:500,power:900,guts:700,wisdom:600},skills:[{id:1},{id:1},{id:2}],support:[{id:30052},{id:30052}],running_style_code:1,aptitudes:{sprint:'S',mile:'A',front:'A',turf:'S',distance:'A',surface:'S'}};
const race={id:'r',raw_sha256:'r',scoring_verified:true,results:[row]};
const draft={roster:[{uma:'Uma',benched:false},{uma:'Bench',benched:true}],uma_bans:[{uma:'Veto'}],uma_pre_bans:[{uma:'Preban'}],track_picks:[{track:'Tokyo 1600m · Turf · Winter'}],track_vetoes:[]};
const match={id:'m',round:'R2',draft,draft_has_content:true,races:[{id:'r'},{id:'duplicate'},{id:'second'}],reported_results:{races:[{number:1,track:'Tokyo 1600m · Turf'},{number:2,track:'Morioka 1600m · Dirt'}]}};
let stats=S.compute({matches:[match]},{r:race,duplicate:race,second:{...race,id:'second',raw_sha256:'second'}});
assert.equal(stats.umas_ran[0].count,1);assert.equal(stats.coverage.builds,1);assert.equal(stats.coverage.starts,2);assert.equal(stats.coverage.reported_races,2);assert.equal(stats.support[0].count,1);assert.equal(stats.skills[0].count,1);assert.equal(stats.fielded.length,1);assert.equal(stats.veto[0].name,'Veto');assert.equal(stats.preban[0].name,'Preban');assert.equal(stats.aptitudes.sprint.S,1);assert.equal(stats.aptitudes.long.unknown,1);assert.equal(stats.active_aptitudes.style.A,2);assert.equal(stats.surface.find(x=>x.name==='Dirt').count,1);
stats=S.compute({matches:[match,{...match,id:'later',races:[{id:'later'}]}]},{r:race,duplicate:race,second:{...race,raw_sha256:'second'},later:{...race,raw_sha256:'later'}});assert.equal(stats.umas_ran[0].count,2);assert.equal(stats.coverage.builds,2);assert.equal(stats.support[0].count,2);
const sameCharacter={...row,team_id:'b',owner:'Bob',variant_id:100102};
const duplicatedUma=S.compute({matches:[match]},{r:{...race,results:[row,sameCharacter]},second:{...race,raw_sha256:'second'}});
assert.deepEqual(duplicatedUma.umas_ran.map(r=>[r.name,r.count]),[['Uma',1]]);
// Keep one matchup count per character. Repeated heats never outweigh another outfit's matchups.
const appearances=(cards,defaultPortrait)=>{
 const matches=cards.map((ids,i)=>({...match,id:'m'+i,races:ids.map((_,j)=>({id:i+'-'+j})),reported_results:null}));
 const docs=Object.fromEntries(cards.flatMap((ids,i)=>ids.map((id,j)=>{
  const key=i+'-'+j;
  return [key,{...race,raw_sha256:key,results:[{...row,variant_id:id}]}];
 })));
 return S.compute({matches},docs,{portraits:{Uma:{portrait:defaultPortrait}}}).umas_ran[0];
};
const original='assets/runners/105801.webp',halloween='assets/runners/105802.webp';
assert.equal(appearances([[105802,105802]],original).image,halloween);
assert.equal(appearances([[105801,105801,105801],[105802],[105802]],original).image,halloween);
assert.equal(appearances([[105802],[105801]],original).image,original);
assert.equal(appearances([[null]],original).image,null);
const draftOnly=S.compute({matches:[{...match,races:[],reported_results:null}]},{});
assert.deepEqual(draftOnly.umas_ran,[]);
const catalog=require('../assets/support-cards.json').cards;
const slots=new Set();
for(const {thumbnail} of Object.values(catalog)){
 const [sheet,col,line]=thumbnail;
 assert.ok(fs.existsSync('assets/supports/stats-'+sheet+'.webp')&&col>=0&&col<6&&line>=0&&line<4);
 assert.ok(!slots.has(thumbnail.join(':')));slots.add(thumbnail.join(':'));
}
assert.deepEqual([1400,1401,1800,1801,2400,2401].map(S.distanceType),['Sprint','Mile','Mile','Medium','Medium','Long']);assert.equal(S.trackKey('Tokyo 1600m · Turf · Summer'),S.trackKey('Tokyo 1600m · Turf · Winter'));
assert.deepEqual(S.ranking(new Map([['a',3],['b',3],['c',1]])).map(r=>r.rank),[1,1,3]);
const dist=S.distribution([100,200,300,400,null]);assert.equal(dist.n,4);assert.equal(dist.median,250);assert.equal(dist.q1,175);assert.equal(dist.q3,325);assert.equal(dist.bins.reduce((n,b)=>n+b.count,0),4);
const snapshot=JSON.parse(fs.readFileSync('data/tournament-statistics.json')),empty=S.compute({matches:[]},{},{});
assert.equal(snapshot.standings,null);
for(const [key,value] of Object.entries(empty.coverage))if(key!=='matches')assert.equal(value,0,key);
for(const key of ['support','skills','fielded','veto','preban'])assert.deepEqual(empty[key],[]);
console.log('Statistics deduplication, boundaries and empty event checks passed.');
