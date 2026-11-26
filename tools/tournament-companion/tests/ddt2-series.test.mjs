import os from 'node:os';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,mkdir,cp} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import net from 'node:net';import {setTimeout as delay} from 'node:timers/promises';
import {initialState,publicBundle} from '../DominatorNetwork/companion/domain.mjs';import {importDDT2,sourcePreview} from '../DominatorNetwork/companion/ddt2.mjs';import {seriesSummary,draftManualHeat,manualReview,approveManual,draftCorrection,correctionReview,approveCorrection,checkSeriesRace,allSeries} from '../DominatorNetwork/companion/series.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(here,'..'),require=createRequire(import.meta.url),contract=require('../../../assets/companion-contract.js'),seriesContract=require('../../../assets/series-contract.js');
const source=JSON.parse(await readFile(path.join(project,'DominatorNetwork/companion/ddt2-seed.json'),'utf8'));
test('live preview reads one public Pages snapshot and reports a refused live request',async()=>{
 const urls=[];
 const preview=await sourcePreview(false,async(url,options)=>{
  urls.push(url);
  assert.deepEqual(options.headers,{Accept:'application/json'});
  return Response.json(source);
 });
 assert.deepEqual(urls,['https://flyingsparks1130.github.io/ddt2/data/helper-bracket.json']);
 assert.equal(preview.offline,false);
 assert.equal(preview.teamCount,12);
 await assert.rejects(sourcePreview(false,async()=>new Response(null,{status:403})),/DDT2 website returned HTTP 403/);
});
function setup(){const s=initialState();importDDT2(s,source);const teams=s.tournament.teams.slice(0,2),m={id:'test-series',name:teams.map(t=>t.name).join(' vs '),round:'Test round',stage:'TEST',siteMatchId:'test-match',siteRoundId:'TEST',teamIds:teams.map(t=>t.id),playerIds:s.tournament.players.filter(p=>teams.some(t=>t.id===p.teamId)).map(p=>p.id),expected:{},heats:Array.from({length:7},(_,i)=>({id:'h'+(i+1),number:i+1,expected:{}}))};s.matches.unshift(m);return {s,m,a:m.playerIds.slice(0,5),b:m.playerIds.slice(5)};}
function manual(s,m,number,podium){const r=draftManualHeat(s,{heatId:m.heats[number-1].id,podium,reason:'Synthetic test podium'});s.revision++;const review=manualReview(s,r);approveManual(s,{manualId:r.id,reviewHash:review.hash,operator:'Test operator',broadcastFinished:true});s.revision++;return r;}
function correct(s,m,kind,extra={}){const c=draftCorrection(s,{matchId:m.id,kind,reason:'Synthetic test correction',...extra});s.revision++;const review=correctionReview(s,c);approveCorrection(s,{correctionId:c.id,reviewHash:review.hash,operator:'Test operator',confirm:true});s.revision++;return c;}
function bundle(s){return {...publicBundle(s),series:{schema:'ddt2-series/v1',teams:s.tournament.teams,matches:allSeries(s)}};}
test('DDT2 imports 12 teams and 60 stable players and the four confirmed opening series',()=>{const s=initialState();const r=importDDT2(s,source);assert.equal(r.teams,12);assert.equal(r.players,60);assert.equal(s.matches.length,4);assert.equal(r.deferredMatches,7);assert.deepEqual(s.site.bracket.map(r=>[r.name,r.matches.length]),[['Round 1',4],['Round 2 / Quarterfinals',4],['Semifinals',2],['Grand Final',1]]);assert(s.tournament.players.every(p=>p.gameName===''));const ids=s.tournament.players.map(p=>p.id);s.tournament.players[0].gameName='Exact game name';importDDT2(s,source);assert.deepEqual(s.tournament.players.map(p=>p.id),ids);assert.equal(s.tournament.players[0].gameName,'Exact game name');assert.deepEqual(s.tournament.rules.points,[4,2,1]);assert.equal(s.github.repo,'ddt2');assert.equal(s.publications.length,0);});
test('races accumulate, target 25 never auto-confirms, and stale decisions disappear after a correction',()=>{const {s,m,a}=setup();for(let n=1;n<=3;n++)manual(s,m,n,a.slice(0,3));assert.equal(seriesSummary(s,m).teams[0].points,21);assert.equal(seriesSummary(s,m).winnerId,null);manual(s,m,4,a.slice(0,3));let summary=seriesSummary(s,m);assert.equal(summary.teams[0].points,28);assert.equal(summary.status,'awaiting-confirmation');assert.equal(summary.winnerId,null);assert.equal(summary.canRace,false);correct(s,m,'outcome',{winnerId:m.teamIds[0]});assert.equal(seriesSummary(s,m).winnerId,m.teamIds[0]);contract.validate(bundle(s),'ddt2');correct(s,m,'score',{scores:{[m.teamIds[0]]:23,[m.teamIds[1]]:5}});summary=seriesSummary(s,m);assert.equal(summary.winnerId,null);assert.equal(summary.status,'outcome-needs-review');assert.equal(summary.teams[0].points,23);contract.validate(bundle(s),'ddt2');correct(s,m,'automatic');assert.equal(seriesSummary(s,m).teams[0].points,28);});
test('six drafted races lead to the seventh tiebreaker and no race is double-counted',()=>{const {s,m,a,b}=setup();for(let n=1;n<=6;n++)manual(s,m,n,n%2?[a[0],b[0],b[1]]:[b[0],a[0],a[1]]);assert.deepEqual(seriesSummary(s,m).teams.map(t=>t.points),[21,21]);assert.equal(seriesSummary(s,m).status,'tiebreaker-required');const duplicate=draftManualHeat(s,{heatId:m.heats[5].id,podium:a.slice(0,3),reason:'Duplicate test'});assert(manualReview(s,duplicate).problems.some(p=>p.includes('already')));manual(s,m,7,[a[0],b[0],b[1]]);assert.deepEqual(seriesSummary(s,m).teams.map(t=>t.points),[25,24]);assert.equal(seriesSummary(s,m).winnerId,null);contract.validate(bundle(s),'ddt2');});
test('manual changes require fresh approval; pending data never reaches exported scores',()=>{const {s,m,a,b}=setup();const c=draftCorrection(s,{matchId:m.id,kind:'score',scores:{[m.teamIds[0]]:25,[m.teamIds[1]]:15},reason:'Test'});assert.equal(seriesSummary(s,m).teams[0].points,0);const review=correctionReview(s,c);s.revision++;assert.throws(()=>approveCorrection(s,{correctionId:c.id,reviewHash:review.hash,operator:'Test',confirm:true}),/changed/);const pending=draftManualHeat(s,{heatId:m.heats[0].id,podium:[a[0],b[0],b[1]],reason:'Pending test'});assert.equal(seriesSummary(s,m).raceCount,0);assert.throws(()=>approveManual(s,{manualId:pending.id,reviewHash:manualReview(s,pending).hash,operator:'Test',broadcastFinished:false}),/finished/);contract.validate(bundle(s),'ddt2');});
test('public contract rejects inflated scores, unapproved outcomes and a forged manual podium',()=>{const {s,m,a}=setup();manual(s,m,1,a.slice(0,3));const good=bundle(s);contract.validate(good,'ddt2');for(const change of [b=>b.series.matches[0].teams[0].points=999,b=>b.series.matches[0].winnerId=m.teamIds[0],b=>b.series.matches[0].races[0].rows[0].points=99]){const bad=structuredClone(good);change(bad);assert.throws(()=>contract.validate(bad,'ddt2'));}const index={id:'ddt2',matches:[{id:'test-match',round:'TEST',participants:m.teamIds.map(id=>({id})),scores:{},winner_id:null}],teams:s.tournament.teams};const projected=seriesContract.apply(index,good);assert.equal(projected.matches[0].scores[m.teamIds[0]],7);assert.equal(projected.matches[0].winner_id,null);assert.deepEqual(index.matches[0].scores,{});});
test('DDT2 HTTP import, operator surfaces, manual approval, and native-preview settings survive restart',{timeout:25000},async()=>{const temp=await mkdtemp(path.join(os.tmpdir(),'dominator-ddt2-')),root=path.join(temp,'root');await mkdir(root,{recursive:true});await cp(path.join(project,'DominatorNetwork/web'),path.join(root,'web'),{recursive:true});await cp(path.join(project,'DominatorNetwork/assets'),path.join(root,'assets'),{recursive:true});const port=await new Promise(resolve=>{const n=net.createServer();n.listen(0,'127.0.0.1',()=>{const p=n.address().port;n.close(()=>resolve(p));});});const base='http://127.0.0.1:'+port;let child;const start=async()=>{child=spawn(process.execPath,[path.join(project,'DominatorNetwork/companion/app.mjs'),'--port',String(port),'--bridge-port','0','--root',root,'--data',path.join(temp,'data')],{windowsHide:true,stdio:'ignore'});for(let i=0;i<80;i++){try{if((await fetch(base+'/api/ops/state')).ok)return;}catch{}await delay(50);}throw Error('Companion did not start');};const stop=async()=>{if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}};const get=async route=>(await fetch(base+'/api/ops/'+route)).json();const post=async(route,body,code=200)=>{const s=await get('state');const r=await fetch(base+'/api/ops/'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Dominator-Ops':'1'},body:JSON.stringify({...body,revision:s.revision})});const data=await r.json();assert.equal(r.status,code,JSON.stringify(data));return data;};try{await start();const preview=await get('ddt2-preview?offline=1');await post('ddt2-sync',{sourceHash:preview.hash});let s=await get('state');assert.equal(Object.keys(s)[0],'version','Desktop launcher expects the version first');
assert.equal(s.tournament.players.length,60);assert.equal(s.github.repo,'ddt2');assert.equal(s.matches.length,4);for(const route of ['/','/matchup','/scoreboard','/overlay','/ddt2-ops.js','/operator-flow.js','/operator-flow.css','/intermission.js','/intermission.css','/assets/ddt2/barlow-condensed-bold.ttf'])assert.equal((await fetch(base+route)).status,200,route);await post('series-match',{teamIds:s.tournament.teams.slice(0,2).map(t=>t.id),stage:'R2/QF'},409);s=await get('state');const m=s.matches.find(m=>m.siteMatchId==='r1-m1');assert.equal(s.matches.length,4);await post('select',{heatId:m.heats[0].id});const entries=m.playerIds.map(playerId=>({playerId,card:100601}));await post('lineup',{heatId:m.heats[0].id,entries});assert.equal((await(await fetch(base+'/api/broadcast')).json()).series.teams[0].players[0].uma.card,100601);assert((await get('uma-catalog')).some(c=>c.card===100602&&c.outfit==='Ashen Miracle'));const draft=await post('manual-draft',{heatId:m.heats[0].id,podium:s.tournament.players.filter(p=>p.teamId===m.teamIds[0]).slice(0,3).map(p=>p.id),reason:'Missing test capture'});assert.equal((await get('export')).series.matches[0].raceCount,0);const review=await get('manual/'+draft.id);await post('manual-approve',{manualId:draft.id,reviewHash:review.hash,operator:'Test',broadcastFinished:true});const bundle=await get('export');contract.validate(bundle,'ddt2');assert.equal(bundle.series.matches[0].teams[0].points,7);await post('game-preview',{enabled:true,demo:true,scale:.8,x:24,y:40,opacity:1});assert.equal((await get('game-preview')).enabled,true);await stop();await start();assert.equal((await get('state')).series[0].teams[0].points,7);assert.equal((await get('game-preview')).scale,.8);assert.equal((await get('state')).publications.length,0);
 const other=s.matches.find(match=>match.id!==m.id);
 const flagged=entries.map((entry,index)=>({...entry,disqualified:index===0}));
 const onAirDQs=async()=>(await(await fetch(base+'/api/broadcast')).json()).series.teams.flatMap(team=>team.players.filter(p=>p.disqualified).map(p=>p.id));
 await post('lineup',{matchId:m.id,entries:flagged});
 await post('select',{heatId:m.heats[1].id});
 await stop();await start();
 assert.deepEqual(await onAirDQs(),[entries[0].playerId]);
 assert.equal((await get('state')).series.find(row=>row.id===m.id).teams[0].points,7);
 await post('select',{heatId:other.heats[0].id});
 assert.deepEqual(await onAirDQs(),[]);
 await post('select',{heatId:m.heats[0].id});
 await post('lineup',{matchId:m.id,entries}); // Older desks omit DQ status.
 assert.deepEqual(await onAirDQs(),[entries[0].playerId]);

 await post('reset-match',{matchId:other.id},400);
 await post('reset-match',{matchId:other.id,confirm:true});
 assert.equal((await get('state')).series.find(x=>x.id===m.id).raceCount,1);
 await post('reset-match',{matchId:m.id,confirm:true});
 const reset=await get('state');
 assert.deepEqual(reset.matches.map(x=>x.id),s.matches.map(x=>x.id));
 assert.equal(reset.series.find(x=>x.id===m.id).raceCount,0);
 assert.deepEqual(reset.series.find(x=>x.id===m.id).teams.map(t=>t.points),[0,0]);
 assert.deepEqual(reset.matches.find(x=>x.id===m.id).lineup,Object.fromEntries(entries.map(e=>[e.playerId,e.card])));
 const secondPreview=await get('ddt2-preview?offline=1');
 await post('ddt2-sync',{sourceHash:secondPreview.hash});
 await post('select',{heatId:s.matches.find(match=>match.teamIds.includes('dominion')).heats[0].id});
 const view=await(await fetch(base+'/api/broadcast')).json();
 assert.equal(view.series.teams.find(t=>t.id==='dominion').representative.card,104603);
 assert.equal(view.series.teams.find(t=>t.id==='domimommy').representative.card,100403);
 await stop();await start();
 assert.equal((await get('state')).matches.length,4);
 assert.equal((await get('export')).series.matches[0].teams[0].points,0);
 // The first capture supplies the ten spotlight choices for the whole matchup.
 const horses=m.playerIds.map((playerId,index)=>({
  finishOrder:index+1,finishTimeRaw:100+index,charaName:'Special Week',
  responseHorseData:{card_id:100101,frame_order:index+1,skill_array:[{skill_id:100101111,level:1}],speed:1210}
 }));
 const raw={raceCourseSet:{distance:2000},raceHorse:horses};
 await post('select',{heatId:m.heats[0].id});
 const first=await post('import',{race:raw,filename:'race1.json',heatId:m.heats[0].id});
 const roster=(await get('state')).matches.find(match=>match.id===m.id).spotlight;
 assert.equal(roster.choices.length,10);assert.equal(new Set(roster.choices.map(c=>c.index)).size,10);
 await post('highlight',{raceId:first.id,index:0,matchId:m.id});
 const spotlight=await(await fetch(base+'/api/highlight')).json();
 assert.equal(spotlight.skills[0].rarity,6);
 assert.equal(spotlight.skills[0].id,100101111);
 for(const asset of [spotlight.uma.art,'/assets/icons/skills/'+spotlight.skills[0].icon+'.webp','/assets/icons/stats/speed.webp'])
  assert.equal((await fetch(base+asset)).status,200,asset);
 const mapping=Object.fromEntries(m.playerIds.map((pid,index)=>[index,pid]));
 for(let n=0;n<2;n++){
  const id=n?(await post('import',{race:{...raw,randomSeed:2},filename:'race2.json'})).id:first.id;
  await post('assign',{raceId:id,heatId:m.heats[n].id});await post('map',{raceId:id,mapping});
  const detail=await get('race/'+id);
  await post('approve',{raceId:id,reviewHash:detail.review.hash,operator:'Test',broadcastFinished:true});
 }
 await post('select',{heatId:m.heats[1].id});
 const swapped={...mapping,0:mapping[5],5:mapping[0]};
 await post('revise',{raceId:first.id,heatId:m.heats[0].id,mapping:swapped,operator:'Test',broadcastFinished:true});
 const edited=await get('finalized?heat='+m.heats[0].id);
 assert.equal(edited.rows[0].playerId,swapped[0]);assert.equal(edited.rows.length,10);
 assert.equal((await get('state')).activeHeatId,m.heats[1].id);
 assert.equal((await get('export')).series.matches.find(x=>x.id===m.id).raceCount,2);
 assert.equal((await(await fetch(base+'/api/highlight')).json()).skills[0].id,100101111);


 await post('reset-match',{matchId:m.id,confirm:true});
 const zipUrl=base+'/api/ops/match-zip?match='+m.id;
 const originals=[];
 const teamA=m.playerIds.filter(id=>s.tournament.players.find(p=>p.id===id).teamId===m.teamIds[0]);
 const teamB=m.playerIds.filter(id=>!teamA.includes(id));
 for(let n=1;n<=6;n++){
  const podium=n===6?[teamA[0],teamB[0],teamA[1]]:[teamA[0],teamB[0],teamB[1]];
  const order=[...podium,...m.playerIds.filter(id=>!podium.includes(id))];
  const capture={...raw,randomSeed:n+100};
  const bytes='\uFEFF'+JSON.stringify(capture,null,2)+'\n';
  const uploaded=await fetch(base+'/api/ops/import-file?filename=round.json&heat='+m.heats[n-1].id,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Dominator-Ops':'1'},body:bytes});
  assert.equal(uploaded.status,200);
  const {id}=await uploaded.json();
  originals.push(Buffer.from(bytes));
  await post('map',{raceId:id,mapping:Object.fromEntries(order.map((id,i)=>[i,id]))});
  const detail=await get('race/'+id);
  await post('approve',{raceId:id,reviewHash:detail.review.hash,operator:'Test',broadcastFinished:true});
  assert.equal((await fetch(zipUrl)).status,400);
 }
 const pending=(await get('state')).series.find(row=>row.id===m.id);
 assert.deepEqual(pending.teams.map(t=>t.points),[25,17]);assert.equal(pending.winnerId,null);
 await post('correction-draft',{matchId:m.id,kind:'outcome',winnerId:m.teamIds[1],reason:'Invalid winner'},400);
 const decision=await post('correction-draft',{matchId:m.id,kind:'outcome',winnerId:m.teamIds[0],reason:'Matchup complete'});
 assert.equal((await fetch(zipUrl)).status,400);
 const finalReview=await get('correction/'+decision.id);
 await post('correction-approve',{correctionId:decision.id,reviewHash:finalReview.hash,operator:'Test',confirm:true});
 const download=await fetch(zipUrl);assert.equal(download.status,200);
 const zip=Buffer.from(await download.arrayBuffer()),files=new Map();
 const {inflateRawSync}=await import('node:zlib');
 for(let offset=0;zip.readUInt32LE(offset)===0x04034b50;){
  const size=zip.readUInt32LE(offset+18),nameEnd=offset+30+zip.readUInt16LE(offset+26);
  const name=zip.toString('utf8',offset+30,nameEnd),start=nameEnd+zip.readUInt16LE(offset+28);
  files.set(name,inflateRawSync(zip.subarray(start,start+size)));offset=start+size;
 }
 assert.equal(files.size,7);assert.equal(zip.readUInt16LE(zip.length-12),7);
 const approved=JSON.parse(files.get('approved-results.json'));contract.validate(approved,'ddt2');
 const {merge}=require('../../../assets/match-package.js');
 assert.doesNotThrow(()=>merge(require('../../../data/tournament-index.json'),null,approved));
 assert.deepEqual(await onAirDQs(),[entries[0].playerId]);
 const recorded=(await get('state')).matches.find(row=>row.id===m.id).lineup;
 await post('lineup',{matchId:m.id,entries:m.playerIds.map(playerId=>({playerId,card:recorded[playerId],disqualified:false}))});
 assert.deepEqual(await onAirDQs(),[]);
 assert.equal(approved.series.matches.length,1);assert.equal(approved.results.length,6);
 for(const [i,original] of originals.entries())assert.deepEqual(files.get('races/race-'+(i+1)+'.json'),original);
 const broadcast=await(await fetch(base+'/api/broadcast')).json();
 assert.equal(broadcast.series.winnerId,m.teamIds[0]);assert.equal(broadcast.columns[1].points[m.teamIds[0]],4);
 assert.equal((await get('finalized?heat='+m.heats[0].id)).rows.find(r=>r.teamId==='dominate').teamCard,102003);
 const reopen=await post('correction-draft',{matchId:m.id,kind:'reopen',reason:'Review scores'});
 const rr=await get('correction/'+reopen.id);
 await post('correction-approve',{correctionId:reopen.id,reviewHash:rr.hash,operator:'Test',confirm:true});
 assert.equal((await fetch(zipUrl)).status,400);
}finally{await stop();}});

test('legacy hidden fixtures return once and unofficial matches retire with their scoring state',async()=>{
 const {needsMatchRecovery,recoverMatches,resetMatch}=await import('../DominatorNetwork/companion/series.mjs');
 const {s,m}=setup(),other=s.matches.find(row=>row!==m);
 m.deskDeletedAt='old';m.heats[0].trackName='Kyoto';
 s.matches.push({...m,id:'local',siteMatchId:null,deskDeletedAt:null,heats:[{id:'local-heat',number:1}]});
 s.races.push({id:'old',status:'approved',heatId:m.heats[0].id,mapping:{0:'player'},approval:{result:{match:{id:m.id},heat:{number:1},rows:[]}}});
 s.manualHeats.push({id:'prior',matchId:m.id,status:'approved'},{id:'other',matchId:other.id,status:'pending'});
 s.corrections.push({matchId:m.id,kind:'outcome',status:'approved'},{matchId:m.id,kind:'score',status:'pending'});
 s.activeHeatId=m.heats[2].id;
 assert(needsMatchRecovery(s));recoverMatches(s);assert(!needsMatchRecovery(s));recoverMatches(s);
 assert.equal(s.retiredMatches.length,1);assert.equal(s.matches.filter(x=>x.id===m.id).length,1);
 assert.equal(m.heats[0].trackName,'Kyoto');assert.equal(s.activeHeatId,m.heats[0].id);
 assert.equal(s.races[0].status,'pending');assert.equal(s.races[0].heatId,null);assert.equal(s.races[0].previousApprovals.length,1);
 assert.equal(s.manualHeats[1].status,'pending');assert(s.corrections.every(c=>c.status==='reset'));
 resetMatch(s,m);assert.equal(s.races[0].previousApprovals.length,1);
 const match=seriesSummary(s,m);assert.equal(match.winnerId,null);assert.equal(match.status,'not-started');
});
