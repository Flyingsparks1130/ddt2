'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const contract=require('../assets/companion-contract.js'),series=require('../assets/series-contract.js');
const teams=['alpha','beta'].map(id=>({id,name:'Test '+id}));
const approval={operator:'Test operator',at:'2026-11-21T00:00:00Z'};
function fixture(){
 const m={id:'synthetic-series',siteMatchId:'synthetic-match',siteRoundId:'TEST',name:'Synthetic test only',round:'Test',stage:'TEST',target:25,standardRaces:6,maxRaces:7,teams:teams.map(t=>({...t,points:0,players:Array.from({length:5},(_,i)=>({id:t.id+i,name:'Test '+t.id+i}))})),races:[],raceCount:0,automaticScores:{alpha:0,beta:0},manualOverride:null,decision:null,winnerId:null};
 const rows=[0,1,2].map(i=>({rank:i+1,points:[4,2,1][i],playerId:'alpha'+i,playerName:'Test alpha'+i,teamId:'alpha',team:'Test alpha'}));
 m.races=[{id:'synthetic-race',heatId:'synthetic-heat',number:1,manual:true,reason:'Test fixture',operator:approval.operator,approvedAt:approval.at,rows}];m.raceCount=1;m.teams[0].points=7;m.automaticScores.alpha=7;m.scoreKey=JSON.stringify({scores:[['alpha',7],['beta',0]],races:['synthetic-race'],manual:null});
 return {schema:'dominator-tournament/v1',tournament:{id:'ddt2',name:'Synthetic test only',scoring:{points:[4,2,1],tiebreak:'shared',aggregation:'sum',unlistedPlaces:0}},results:[],voided:[],standings:{players:[],teams:[]},series:{schema:'ddt2-series/v1',teams,matches:[m]}};
}
const bundle=fixture();contract.validate(bundle,'ddt2');
for(const mutate of [b=>b.series.matches[0].teams[0].points=30,b=>b.series.matches[0].winnerId='alpha',b=>b.series.matches[0].races[0].rows[0].points=9,b=>b.series.matches[0].races[0].operator='']){const b=structuredClone(bundle);mutate(b);assert.throws(()=>contract.validate(b,'ddt2'));}
const index={id:'ddt2',teams,matches:[{id:'synthetic-match',round:'TEST',participants:teams,scores:{},winner_id:null}]};
assert.equal(series.apply(index,bundle).matches[0].scores.alpha,7);assert.deepEqual(index.matches[0].scores,{});
for(const official of [{scores:{alpha:12,beta:9}},{winner_id:'beta'},{reported_results:{races:[{number:1,podium:[]}]}}]){const protectedIndex=structuredClone(index);Object.assign(protectedIndex.matches[0],official);const projected=series.apply(protectedIndex,bundle);assert.equal(projected.matches[0].companion_conflict,true);for(const key of Object.keys(official))assert.deepEqual(projected.matches[0][key],official[key]);}
const confirmed=fixture(),m=confirmed.series.matches[0];m.decision={id:'decision',matchId:m.id,kind:'outcome',status:'approved',reason:'Verified',approval,winnerId:'alpha',scoreKey:m.scoreKey};m.winnerId='alpha';contract.validate(confirmed,'ddt2');assert.equal(series.apply(index,confirmed).matches[0].winner_id,'alpha');
const ctx={CompanionContract:contract,DDT2SeriesContract:series,Response,fetch};ctx.window=ctx;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/companion-feed.js'),'utf8'),ctx);
(async()=>{const feed=ctx.DDT2CompanionFeed;assert.equal((await feed.merge(index,async()=>new Response(JSON.stringify(bundle)))).matches[0].scores.alpha,7);const stale=await feed.merge(index,async()=>new Response('{}'));assert(stale.companion_warning);assert.equal(stale.matches[0].scores.alpha,7);assert.equal((await feed.merge(index,async()=>new Response('',{status:404}))).matches[0].winner_id,null);
 for(const name of ['index','bracket','archive','clubs','rules','stats','tracks']){const html=fs.readFileSync(path.join(__dirname,'../'+name+'.html'),'utf8');assert(html.indexOf('assets/series-contract.js')<html.indexOf('assets/companion-contract.js'));assert(html.indexOf('assets/companion-feed.js')<html.indexOf('assets/ddt2-app.js'));}
 console.log('Series approval, conflict protection, stale-feed fallback and page wiring passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
