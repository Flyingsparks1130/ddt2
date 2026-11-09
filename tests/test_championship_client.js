const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
require('./test_ddt2_navigation.cjs');
const source=fs.readFileSync('assets/tournament.js','utf8').replace(/boot\(\);?\s*$/,'');
const real=JSON.parse(fs.readFileSync('data/tournament-index.json','utf8'));
const root={innerHTML:''};
const context={console,URLSearchParams,document:{querySelector:()=>root,querySelectorAll:()=>[]},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('config/timeline.json','utf8'))})};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('assets/competition.js','utf8'),context);vm.runInContext(source,context);
async function render(data){context.seed=data;vm.runInContext('index=seed',context);await vm.runInContext('home()',context);return root.innerHTML;}
(async()=>{
 const pending=structuredClone(real);pending.champion_id=null;pending.matches.find(m=>m.round==='R4').winner_id=null;
 assert.equal(real.champion_id,null);assert(real.matches.every(m=>!m.winner_id&&!m.scores&&!m.races.length));
 const before=await render(pending);assert(before.includes('Match results will appear here once confirmed.'));assert(before.includes('Next-event details are not finalized.'));assert(before.includes('Who will'));assert(!before.includes('DDT2 champions.'));assert.equal(vm.runInContext('championshipBanner()',context),'');
 const future=structuredClone(real),final=future.matches.find(m=>m.round==='R4');future.id='test';future.champion_id='a';final.participants=[{id:'a',name:'Example Club'},{id:'b',name:'Other Club'}];final.winner_id='a';final.scores={a:25,b:20};final.reported_results={mvp:{display_name:'Example Player'}};
 const after=await render(future);assert(after.includes('Example Club.<br><em>DDT2 champions.'));assert(after.includes('25–20'));assert(after.includes('Match MVP: Example Player'));assert(!after.includes('Match results will appear here'));assert.equal((after.match(/class="dn-round-complete"/g)||[]).length,4);assert(after.includes('archive.html?round=R4&amp;')===false);assert(after.includes('archive.html?round=R4&match=r4-m1'));
 vm.runInContext('overview()',context);assert(root.innerHTML.includes('Example Club are the champions.'));assert(root.innerHTML.includes('25–20'));assert(root.innerHTML.includes('Match MVP: Example Player'));assert(!root.innerHTML.includes('NOW OPEN'));
 console.log('Championship homepage and bracket checks passed; an unconfirmed score cannot announce a champion.');
})().catch(e=>{console.error(e);process.exitCode=1});
