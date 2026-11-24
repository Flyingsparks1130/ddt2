import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {readFile,stat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {initialState,InputError,requireThat,id,text,cleanName,digest,rulesFrom,playersFrom,heatFor,readRace,reviewRace as baseReview,publicBundle as baseBundle} from './domain.mjs';
import {roundName,finalized,highlight,packageZip,matchExport,enrichPackage,captureFiles,spotlightRoster} from './production.mjs';
import {openStore,atomicWrite} from './store.mjs';
import {publicationPreview} from './github.mjs';
import {sourcePreview,importDDT2,bracketPreview} from './ddt2.mjs';
import {broadcastState,saveLineup,umaCatalog} from './broadcast.mjs';
import {matchLineup,resetMatch,needsMatchRecovery,recoverMatches,allSeries,seriesSummary,checkSeriesRace,draftCorrection,correctionReview,approveCorrection,draftManualHeat,manualReview,approveManual} from './series.mjs';

function reviewRace(state,race){const review=baseReview(state,race);if(race.heatId)checkSeriesRace(state,race,review.problems);review.problems=[...new Set(review.problems)];review.canApprove=review.problems.length===0&&race.status==='pending';review.hash=digest({review,revision:state.revision});return review;}
function publicBundle(state){const bundle=baseBundle(state);if(state.tournament.seriesFormat)bundle.series={schema:'ddt2-series/v1',teams:state.tournament.teams,matches:allSeries(state),sourceCommit:state.site?.commit||null};return bundle;}
async function matchAttachment(matchId) {
 const bundle = matchExport(publicBundle(store.state), matchId);
 const match = bundle.series.matches[0];
 return {
  filename: 'DDT2-' + match.siteMatchId + '.zip',
  content: packageZip(await enrichPackage(bundle, dataDir), await captureFiles(bundle, dataDir))
 };
}

const here=path.dirname(fileURLToPath(import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const port=Number(args.port||27840),bridgePort=Number(args['bridge-port']||27845);
const root=path.resolve(args.root||path.dirname(here));
const dataDir=path.resolve(args.data||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'DominatorTournament'));
const origin=`http://127.0.0.1:${port}`,bridgeOrigin=`http://127.0.0.1:${bridgePort}`;
const settingsPath=path.join(root,'obs-settings.json');
const previewPath=path.join(root,'game-preview.json');
const previewDefaults={enabled:false,demo:true,x:16,y:100,scale:1,opacity:1};
async function previewSettings(){try{return {...previewDefaults,...JSON.parse(await readFile(previewPath,'utf8'))};}catch{return {...previewDefaults};}}
let sourceCache=null,spotlightRevision=-1,spotlightData=null;
function currentSpotlight(){
 const state=store.state;
 if(spotlightRevision!==state.revision){
  spotlightRevision=state.revision;
  spotlightData=highlight(state,dataDir,state.highlight).catch(e=>{if(spotlightRevision===state.revision)spotlightRevision=-1;throw e;});
 }
 return spotlightData;
}
const defaults={tournament:'DOMINATOR NETWORK',matchup:'MATCHUP TBD',round:'ROUND TBD',stage:'TBD',enabled:true,autoFit:true,compact:false,indicators:true,scale:1,motion:320,opacity:1,teams:{},picks:[]};
let config={...defaults};try{config={...defaults,...JSON.parse(await readFile(settingsPath,'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
let store,bridge=null,bridgeBusy=false,overlayNotice='',watchNotice='',watchSignature='',watchKnown=new Map(),watchBaseline=true,watchBusy=false,configTail=Promise.resolve();
const audit=(state,action,detail)=>state.audit.push({at:new Date().toISOString(),action,detail});
function response(res,status,value,type='application/json; charset=utf-8',headers={}){
 const body=Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value);
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://raw.githubusercontent.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'",...headers});res.end(body);
}
async function bodyText(req){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;requireThat(length<=16*1024*1024,'Upload is too large (16 MB maximum).',413);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
async function bodyOf(req){const source=await bodyText(req);try{return JSON.parse(source.replace(/^\uFEFF/,''));}catch{throw new InputError('Request is not valid JSON.');}}
function writable(state){requireThat(!state.races.some(r=>r.status==='approved'),'Tournament rules and participants are locked while approved results exist. Void those results before changing the format.');}
function checkRevision(state,body){requireThat(body.revision===state.revision,'The tournament changed in another window. Refresh and review again.',409);}
function validateConfig(raw){const next={...defaults};for(const k of ['tournament','matchup','round','stage'])if(typeof raw[k]==='string'&&raw[k].length<=256)next[k]=raw[k];
 for(const k of ['enabled','autoFit','compact','indicators'])if(typeof raw[k]==='boolean')next[k]=raw[k];
 for(const [k,min,max] of [['scale',.45,2],['motion',80,1000],['opacity',.45,1]])if(Number.isFinite(raw[k]))next[k]=Math.max(min,Math.min(max,raw[k]));
 if(raw.teams&&typeof raw.teams==='object'&&!Array.isArray(raw.teams))next.teams=Object.fromEntries(Object.entries(raw.teams).filter(([k,v])=>k.length<=192&&typeof v==='string'&&v.length<=192).slice(0,64));
 if(Array.isArray(raw.picks))next.picks=raw.picks.filter(n=>Number.isInteger(n)&&n>=1&&n<=32).slice(0,3);return next;
}
async function writeConfig(raw){const next=validateConfig(raw);await atomicWrite(settingsPath,next);config=next;
 if(bridge){try{const result=await fetch(bridgeOrigin+'/api/config',{method:'POST',headers:{'Content-Type':'application/json',Origin:bridgeOrigin,'X-Dominator-Settings':'1'},body:JSON.stringify(next),signal:AbortSignal.timeout(1800)});if(!result.ok)throw Error(`Bridge returned ${result.status}`);config=await result.json();overlayNotice='Broadcast header synchronized.';}catch{overlayNotice='Settings saved. The game bridge will synchronize on reconnect.';}}else overlayNotice='Settings saved for the next game session.';return config;
}
function saveConfig(raw){const run=configTail.then(()=>writeConfig(raw));configTail=run.catch(()=>{});return run;}
async function syncActive(){if(!store?.state.activeHeatId)return;const {match,heat}=heatFor(store.state,store.state.activeHeatId);await saveConfig({...config,tournament:store.state.tournament.name,matchup:match.name,stage:match.siteRoundId?roundName(match):match.stage,round:match.siteRoundId?'Race '+heat.number:match.round+' · HEAT '+heat.number,teams:Object.fromEntries(store.state.tournament.players.map(p=>[p.gameName,p.team]))});}
async function refreshBridge(){if(bridgeBusy)return;bridgeBusy=true;const wasOnline=!!bridge;try{const result=await fetch(bridgeOrigin+'/api/state',{signal:AbortSignal.timeout(700)});if(!result.ok)throw Error();bridge=await result.json();
 if(!wasOnline){if(store?.state.activeHeatId)await syncActive();else if(digest(bridge.config)!==digest(config))await saveConfig(config);}
 }catch{bridge=null;}finally{bridgeBusy=false;}}
async function importRace(raw,filename,heatId=null,fromWatch=false,source=null){const race=readRace(raw);const existing=store.state.races.find(r=>r.fingerprint===race.fingerprint);if(existing)return {id:existing.id,duplicate:true};
 await store.saveRaw(race.fingerprint,source??JSON.stringify(raw));
 return store.transaction(state=>{const duplicate=state.races.find(r=>r.fingerprint===race.fingerprint);if(duplicate)return {id:duplicate.id,duplicate:true};
  requireThat(state.races.length<5000,'This tournament has reached the 5000-race limit.');
  const assignment=fromWatch?state.armedHeatId:heatId;if(assignment)heatFor(state,assignment);
  const entry={...race,id:id(),filename:path.basename(String(filename||'Imported race.json')).slice(0,200),heatId:assignment,status:'pending',mapping:{},importedAt:new Date().toISOString()};
  state.races.push(entry);if(fromWatch&&assignment)state.armedHeatId=null;audit(state,'race.imported',{raceId:entry.id,heatId:assignment});return {id:entry.id,duplicate:false};});
}
async function scanFiles(folder,depth=0){if(depth>5)return [];let found=[];for(const entry of await readdir(folder,{withFileTypes:true})){
 if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name);
 if(entry.isDirectory())found.push(...await scanFiles(file,depth+1));else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.json')){const s=await stat(file);if(s.size<=16*1024*1024)found.push({file,size:s.size,mtime:s.mtimeMs});}
 if(found.length>10000)throw Error('Watch folder is too large. Choose the Saved races folder instead.');}return found;}
async function watchTick(){if(watchBusy||!store?.state.watch.enabled)return;watchBusy=true;
 try{const {folder}=store.state.watch;if(folder!==watchSignature){watchSignature=folder;watchKnown=new Map();watchBaseline=true;}
  const files=(await scanFiles(folder)).sort((a,b)=>a.mtime-b.mtime);
  for(const file of files){const sig=`${file.size}:${file.mtime}`,known=watchKnown.get(file.file);if(watchBaseline){watchKnown.set(file.file,{sig,done:true});continue;}
   if(known?.sig===sig&&known.done)continue;if(!known||known.sig!==sig){watchKnown.set(file.file,{sig,seen:Date.now(),done:false});continue;}
   if(Date.now()-known.seen<1500)continue;
   try{const source=await readFile(file.file,'utf8');const raw=JSON.parse(source.replace(/^\uFEFF/,''));if(!raw.raceHorse){known.done=true;continue;}const imported=await importRace(raw,path.basename(file.file),null,true,source);known.done=true;watchNotice=imported.duplicate?'Duplicate replay ignored.':'New race staged for review. Results are not published.';}
   catch(e){watchNotice=`Waiting for a complete race file: ${path.basename(file.file)} (${e.message})`;if(Date.now()-known.seen>15000)known.done=true;}
  }watchBaseline=false;
 }catch(e){watchNotice=e.message;}finally{watchBusy=false;}}
function opsState(){
 const state=store.state,bundle=publicBundle(state);
 const {matches,races}=state;
 const trainerNames=[...new Set(races.flatMap(r=>r.runners.map(entry=>entry.trainer)).filter(Boolean))].sort();
 return {version:'0.6.11',revision:state.revision,tournament:state.tournament,trainerNames,canResetMatch:true,matchLineups:true,highlight:state.highlight||null,matches:matches.map(m=>({...m,round:roundName(m),stage:roundName(m),lineup:matchLineup(state,m),spotlight:spotlightRoster(state,m)})),site:state.site||null,series:allSeries(state),corrections:(state.corrections||[]).filter(c=>c.status!=='reset'),manualHeats:(state.manualHeats||[]).filter(h=>h.status!=='reset'),activeHeatId:state.activeHeatId,armedHeatId:state.armedHeatId,suggestedWatchFolder:path.join(os.homedir(),'Documents','Saved races'),
 races:races.map(({id,filename,heatId,status,importedAt,runners,voidReason})=>({id,filename,heatId,status,importedAt,count:runners.length,voidReason})),
 watch:state.watch,watchNotice,github:state.github,publication:publicationPreview(state,bundle,!!process.env.DOMINATOR_GITHUB_TOKEN),publications:state.publications.slice(-10).reverse(),
 standings:bundle.standings,audit:state.audit.slice(-30).reverse(),locked:state.races.some(r=>r.status==='approved'),bridge:{connected:!!bridge,active:!!bridge?.active,count:bridge?.runners?.length||0,version:bridge?.version||null},overlayNotice};}
async function mutate(route,body){
 if(route==='publish'||route==='github')throw new InputError('Export a match ZIP from the Race Desk.',410);
 if(route==='import')return importRace(body.race,body.filename,body.heatId||null);
 if(route==='game-preview'){const p={...previewDefaults};for(const key of ['enabled','demo'])p[key]=body[key]===true;for(const [key,min,max] of [['x',0,3840],['y',0,2160],['scale',.45,2],['opacity',.45,1]])if(Number.isFinite(body[key]))p[key]=Math.max(min,Math.min(max,body[key]));await atomicWrite(previewPath,p);return p;}
const result=await store.transaction(async state=>{checkRevision(state,body);
  if(route==='reset-match'){
   const match=state.matches.find(m=>m.id===body.matchId);
   requireThat(match,'Match not found.',404);
   requireThat(body.confirm===true,'Confirm the score reset.');
   requireThat(!match.heats.some(h=>h.id===state.armedHeatId),'Cancel capture before resetting this match.',409);
   resetMatch(state,match);
   audit(state,'match.reset',{matchId:match.id,name:match.name});
   return {id:match.id};
  }
  if(route==='delete-match')throw new InputError('Refresh the Race Desk and choose Reset match.',409);
  if(route==='ddt2-sync'){requireThat(sourceCache&&body.sourceHash===sourceCache.hash,'Refresh the DDT2 import preview first.',409);const result=importDDT2(state,sourceCache.source);audit(state,'ddt2.synchronized',{...result,commit:sourceCache.source.commit});return result;}
  else if(route==='lineup'){const result=saveLineup(state,body);audit(state,'match.lineup',result);return result;}
  else if(route==='player-alias'){const p=state.tournament.players.find(p=>p.id===body.playerId);requireThat(p,'Player not found.');const name=cleanName(String(body.gameName||'')).slice(0,120);requireThat(!name||!state.tournament.players.some(x=>x.id!==p.id&&x.gameName===name),'That in-game name is already assigned to another player.');p.gameName=name;audit(state,'player.alias',{playerId:p.id,name});}
  else if(route==='series-match')throw new InputError('DDT2 matchups come from the published bracket.',409);
  else if(route==='heat-course'){const {heat}=heatFor(state,body.heatId);requireThat(!state.races.some(r=>r.status==='approved'&&r.heatId===heat.id)&&!(state.manualHeats||[]).some(r=>r.status==='approved'&&r.heatId===heat.id),'An approved race already uses this track slot.');heat.trackName=String(body.trackName||'').trim().slice(0,120);heat.expected={};for(const key of ['distance','surface','trackId']){const value=Number(body[key]||0);requireThat(Number.isInteger(value)&&value>=0,'Course checks must be whole numbers.');heat.expected[key]=value;}audit(state,'heat.course',{heatId:heat.id,trackName:heat.trackName});}
  else if(route==='correction-draft'){const c=draftCorrection(state,body);audit(state,'correction.drafted',{id:c.id,kind:c.kind,reason:c.reason});return {id:c.id};}
  else if(route==='correction-approve'){const c=approveCorrection(state,body);audit(state,'correction.approved',{id:c.id,kind:c.kind,operator:c.approval.operator,reason:c.reason});}
  else if(route==='correction-discard'){const c=state.corrections?.find(c=>c.id===body.correctionId);requireThat(c?.status==='pending','Only a pending correction can be discarded.');c.status='discarded';audit(state,'correction.discarded',{id:c.id});}
  else if(route==='manual-draft'){const m=draftManualHeat(state,body);audit(state,'manual.drafted',{id:m.id,reason:m.reason});return {id:m.id};}
  else if(route==='manual-approve'){const m=approveManual(state,body);audit(state,'manual.approved',{id:m.id,operator:m.approval.operator,reason:m.reason});}
  else if(route==='manual-void'){const m=state.manualHeats?.find(m=>m.id===body.manualId);requireThat(m&&m.status!=='void','Manual result not found.');m.status='void';m.voidReason=text(body.reason,'Void reason',500);audit(state,'manual.voided',{id:m.id,reason:m.voidReason});}
  else if(route==='setup'){requireThat(state.tournament.id!=='ddt2','DDT2 uses the published roster and rules. Edit in-game aliases in the Teams tab.');writable(state);state.tournament.name=text(body.name,'Tournament name',120);state.tournament.rules=rulesFrom(body.rules);const players=playersFrom(body.players||[]);
   const referenced=new Set(state.matches.flatMap(m=>m.playerIds));requireThat([...referenced].every(pid=>players.some(p=>p.id===pid)),'A participant is already used by a match. Keep their in-game name; display names and team names can still be updated.');state.tournament.players=players;audit(state,'tournament.configured',{rules:state.tournament.rules,players:players.length});}
  else if(route==='match'){requireThat(state.tournament.id!=='ddt2','DDT2 matchups come from the published bracket.');requireThat(state.matches.length<256,'Maximum 256 matches.');const selected=body.playerIds||[];requireThat(selected.length>0&&new Set(selected).size===selected.length&&selected.every(pid=>state.tournament.players.some(p=>p.id===pid)),'Choose registered participants for this match.');
   const count=Number(body.heats);requireThat(Number.isInteger(count)&&count>=1&&count<=64,'Choose 1–64 heats.');const expected={};for(const key of ['distance','surface','trackId']){const value=Number(body.expected?.[key]||0);requireThat(Number.isInteger(value)&&value>=0,'Course constraints must be whole numbers.');expected[key]=value;}
   const match={id:id(),name:text(body.name,'Match name'),round:text(body.round,'Round',60),stage:text(body.stage,'Stage',30),playerIds:selected,expected,heats:Array.from({length:count},(_,i)=>({id:id(),number:i+1}))};state.matches.push(match);audit(state,'match.created',{matchId:match.id});return {id:match.id};}
  else if(route==='select'){const {match}=heatFor(state,body.heatId);requireThat(!match.deskDeletedAt,'This match was deleted from the desk.',409);const previous=state.activeHeatId&&heatFor(state,state.activeHeatId).match;
   if(previous?.id!==match.id)state.highlight=match.spotlightChoice||null;
   state.activeHeatId=body.heatId;state.armedHeatId=null;audit(state,'heat.selected',{heatId:body.heatId});}
  else if(route==='arm'){requireThat(state.activeHeatId,'Select a heat first.');const problems=[];checkSeriesRace(state,{heatId:state.activeHeatId},problems);requireThat(!problems.length,problems.join(' '));requireThat(state.watch.enabled&&state.watch.folder,'Enable the horseACT watch folder first.');requireThat(!state.races.some(r=>r.heatId===state.activeHeatId&&r.status==='approved'),'This heat already has an approved result.');if(watchBaseline||watchSignature!==state.watch.folder){const files=await scanFiles(state.watch.folder);watchKnown=new Map(files.map(f=>[f.file,{sig:`${f.size}:${f.mtime}`,done:true}]));watchBaseline=false;watchSignature=state.watch.folder;}state.armedHeatId=state.activeHeatId;audit(state,'heat.armed',{heatId:state.activeHeatId});}
  else if(route==='disarm'){state.armedHeatId=null;}
  else if(route==='highlight'){
   const match=state.matches.find(m=>m.id===body.matchId);
   const roster=match&&spotlightRoster(state,match);
   requireThat(roster&&roster.raceId===body.raceId&&roster.choices.some(row=>row.index===body.index),'Choose a runner from this matchup.');
   state.highlight={matchId:match.id,raceId:roster.raceId,index:body.index};
   match.spotlightChoice=state.highlight;
  }
  else if(route==='watch'){const folder=String(body.folder||'').trim();requireThat(!body.enabled||path.isAbsolute(folder),'Choose an absolute Saved races folder path.');if(folder){const item=await stat(folder);requireThat(item.isDirectory(),'The watch path must be a folder.');}
   state.watch={folder,enabled:!!body.enabled};watchSignature='';watchBaseline=true;state.armedHeatId=null;audit(state,'watch.configured',{enabled:state.watch.enabled});}
  else {
   const race=state.races.find(r=>r.id===body.raceId);requireThat(race,'Race not found.',404);
   if(route==='revise'){
    requireThat(race.status==='approved'&&body.broadcastFinished===true,'Confirm the finalized race correction.');
    const operator=text(body.operator,'Operator name',80);
    const next={...race,heatId:body.heatId,mapping:body.mapping,status:'pending'};
    const {match}=heatFor(state,next.heatId);
    requireThat(next.mapping&&typeof next.mapping==='object'&&Object.entries(next.mapping).every(([key,pid])=>race.runners.some(r=>String(r.index)===key)&&match.playerIds.includes(pid)),'Invalid player assignment.');
    if(next.heatId!==race.heatId){
     const old=heatFor(state,race.heatId);
     requireThat(!seriesSummary(state,old.match).races.some(r=>r.number>old.heat.number),'Correct later races before moving this race.');
    }
    const review=reviewRace(state,next);requireThat(review.canApprove,review.problems.join(' '));
    const before=race.approval;
    race.mapping=next.mapping;race.heatId=next.heatId;
    race.approval={operator,at:new Date().toISOString(),result:{raceId:race.id,match:review.match,heat:review.heat,track:review.track,rows:review.rows,rules:review.rules}};
    audit(state,'race.revised',{raceId:race.id,operator,previousHeat:before.result.heat.id,previousPlayers:before.result.rows.map(r=>r.playerId)});
   }
   else if(route==='assign'){requireThat(race.status==='pending','Only pending results can be reassigned.');heatFor(state,body.heatId);race.heatId=body.heatId;race.mapping={};audit(state,'race.assigned',{raceId:race.id,heatId:race.heatId});}
   else if(route==='map'){requireThat(race.status==='pending'&&race.heatId,'Assign the pending race to a heat first.');const {match}=heatFor(state,race.heatId);requireThat(body.mapping&&typeof body.mapping==='object'&&!Array.isArray(body.mapping),'Participant mapping is invalid.');const mapping={};for(const [index,pid] of Object.entries(body.mapping)){requireThat(race.runners.some(r=>String(r.index)===index)&&match.playerIds.includes(pid),'Participant mapping is invalid.');mapping[index]=pid;}if(state.tournament.id==='ddt2')requireThat(new Set(Object.values(mapping)).size===Object.keys(mapping).length,'Each player can be assigned to only one gate.');race.mapping=mapping;audit(state,'race.mapped',{raceId:race.id});}
   else if(route==='approve'){requireThat(race.status==='pending','Only pending results can be approved.');const review=reviewRace(state,race);requireThat(body.reviewHash===review.hash,'The score review changed. Review it again before approval.',409);requireThat(review.canApprove,review.problems.join(' '));requireThat(body.broadcastFinished===true,'Confirm that the broadcast race has finished before approving.');
    const operator=text(body.operator,'Operator name',80);race.status='approved';race.approval={at:new Date().toISOString(),operator,result:{raceId:race.id,match:review.match,heat:review.heat,track:review.track,rows:review.rows,rules:review.rules}};audit(state,'race.approved',{raceId:race.id,heatId:race.heatId,operator});}
   else if(route==='void'){requireThat(race.status!=='void','This race is already void.');race.status='void';race.voidReason=text(body.reason,'Reason for voiding',300);audit(state,'race.voided',{raceId:race.id,reason:race.voidReason});}
   else throw new InputError('Unknown operation.',404);
  }
  return {ok:true};
 });
 if(['reset-match','select','setup','ddt2-sync'].includes(route)){try{if(store.state.activeHeatId)await syncActive();else if(route==='ddt2-sync')await saveConfig({...config,tournament:store.state.tournament.name,matchup:store.state.site?.bracketPublished?'Select a match':'BRACKET TO BE ANNOUNCED',stage:'DDT2',round:'FIRST TO 25'});}catch(e){overlayNotice=`Match saved; header update needs attention: ${e.message}`;}}
 return result;
}
const staticFiles={'/race-result':'feature.html','/uma-highlight':'feature.html','/feature.js':'feature.js','/feature.css':'feature.css','/desk-scenes.js':'desk-scenes.js','/stinger.webm':'ddt2-stinger.webm','/':'ops.html','/ops.js':'ops.js','/ops.css':'ops.css','/ddt2-ops.js':'ddt2-ops.js','/ddt2-ops.css':'ddt2-ops.css','/broadcast':'settings.html','/settings':'settings.html','/settings.js':'settings.js','/settings.css':'settings.css','/overlay':'overlay.html','/overlay.js':'overlay.js','/overlay.css':'overlay.css','/ddt2-race.css':'ddt2-race.css','/model.js':'model.js','/matchup':'intermission.html','/scoreboard':'intermission.html','/intermission.css':'intermission.css','/intermission.js':'intermission.js','/matchup.css':'matchup.css','/matchup.js':'matchup.js','/operator-flow.js':'operator-flow.js','/operator-flow.css':'operator-flow.css'};
const mime={'.webp':'image/webp','.webm':'video/webm','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{try{
 requireThat(store,'The companion is starting. Please try again shortly.',503);
 requireThat(req.headers.host===`127.0.0.1:${port}`,'Use the local 127.0.0.1 address.',403);
 const url=new URL(req.url,origin),route=url.pathname;
 if(req.method==='POST'){requireThat(req.headers.origin===origin&&String(req.headers['content-type']||'').startsWith('application/json'),'Operations must come from this local console.',403);
  if(route==='/api/config'){requireThat(req.headers['x-dominator-settings']==='1','Invalid settings request.',403);return response(res,200,await saveConfig(await bodyOf(req)));}
  requireThat(route.startsWith('/api/ops/')&&req.headers['x-dominator-ops']==='1','Invalid operation request.',403);
  if(route==='/api/ops/import-file'){
   const source=await bodyText(req);
   const raw=JSON.parse(source.replace(/^\uFEFF/,''));
   return response(res,200,await importRace(raw,url.searchParams.get('filename'),url.searchParams.get('heat')||null,false,source));
  }
  return response(res,200,await mutate(route.slice('/api/ops/'.length),await bodyOf(req)));}
 requireThat(req.method==='GET','Method not allowed.',405);
 if(route==='/api/state'){if(!bridge)return response(res,503,{error:'Game bridge offline'});return response(res,200,{...bridge,config});}
 if(route==='/api/config')return response(res,200,config);
 if(route==='/api/ops/match-zip'){
  const attachment=await matchAttachment(url.searchParams.get('match'));
  return response(res,200,attachment.content,'application/zip',{'Content-Disposition':'attachment; filename="'+attachment.filename+'"'});
 }
 if(route==='/api/ops/finalized')return response(res,200,finalized(store.state,url.searchParams.get('heat')));
 if(route==='/api/results')return response(res,200,finalized(store.state,store.state.activeHeatId));
 if(route==='/api/highlight')return response(res,200,await currentSpotlight());
 if(route==='/api/ops/game-preview')return response(res,200,await previewSettings());
 if(route==='/api/ops/ddt2-preview'){sourceCache=await sourcePreview(url.searchParams.get('offline')==='1');return response(res,200,{hash:sourceCache.hash,offline:sourceCache.offline,commit:sourceCache.source.commit,teamCount:sourceCache.teamCount,playerCount:sourceCache.playerCount,matchCount:sourceCache.matchCount,bracket:bracketPreview(sourceCache.source)});}
 if(route==='/api/broadcast')return response(res,200,broadcastState(store.state,config,!!bridge));
 if(route==='/api/ops/courses')return response(res,200,JSON.parse(await readFile(path.join(root,'assets/courses.json'),'utf8')));
 if(route==='/api/ops/uma-catalog')return response(res,200,umaCatalog);
 if(route.startsWith('/api/ops/correction/')){const c=store.state.corrections?.find(c=>c.id===route.split('/').pop());requireThat(c,'Correction not found.',404);return response(res,200,correctionReview(store.state,c));}
 if(route.startsWith('/api/ops/manual/')){const m=store.state.manualHeats?.find(m=>m.id===route.split('/').pop());requireThat(m,'Manual result not found.',404);return response(res,200,manualReview(store.state,m));}
 if(route==='/api/ops/state')return response(res,200,opsState());
 if(route==='/api/ops/publication'){const bundle=publicBundle(store.state);return response(res,200,{...publicationPreview(store.state,bundle,!!process.env.DOMINATOR_GITHUB_TOKEN),targetHash:digest(store.state.github),bundle});}
 if(route==='/api/ops/export')return response(res,200,publicBundle(store.state),'application/json; charset=utf-8',{'Content-Disposition':'attachment; filename="tournament-approved.json"'});
 if(route.startsWith('/api/ops/race/')){const race=store.state.races.find(r=>r.id===route.slice('/api/ops/race/'.length));requireThat(race,'Race not found.',404);return response(res,200,{race,review:race.status==='approved'?{...race.approval.result,problems:[],canApprove:false}:reviewRace(store.state,race)});}
 let file=staticFiles[route]?path.join(root,'web',staticFiles[route]):null;
 if(/^\/assets\/racewear\/\d{6}\.webp$/.test(route))file=path.join(root,route.slice(1));
 else if(route==='/assets/icons/ranks.webp')file=path.join(root,'assets/icons/ranks.webp');
 else if(/^\/assets\/icons\/(?:skills\/\d+|stats\/(?:speed|stamina|power|guts|wit))\.webp$/.test(route))file=path.join(root,route.slice(1));
 else if(/^\/assets\/cards\/\d{6}\.png$/.test(route)||route==='/assets/gentildonna.png')file=path.join(root,route.slice(1));
 if(/^\/assets\/ddt2\/(?:crests\/)?[a-z0-9-]+\.(?:png|svg|ttf)$/.test(route))file=path.join(root,route.slice(1));
 requireThat(file,'Not found.',404);return response(res,200,await readFile(file),mime[path.extname(file)]||'application/octet-stream');
 }catch(e){if(!res.headersSent)response(res,e.status||500,{error:e.code==='ENOENT'?'File or folder was not found.':e.message||'Operation failed.'});else res.end();}});
server.requestTimeout=20000;server.headersTimeout=10000;
server.on('error',error=>{if(error.code==='EADDRINUSE'){console.log('Tournament companion is already running, or its port is occupied.');process.exit(0);}console.error(error.message);process.exit(1);});
// Bind first: a second game launch must not open or mutate a second copy of the store.
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const opened=await openStore(dataDir,config.tournament);
if(needsMatchRecovery(opened.state))await opened.transaction(recoverMatches);
store=opened;
await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'companion-process.json'),JSON.stringify({pid:process.pid,port,version:'0.6.11',startedAt:new Date().toISOString()}));
await refreshBridge();setInterval(refreshBridge,100);setInterval(watchTick,2000);
console.log(`DDT2 tournament companion 0.6.11: ${origin} (bridge ${bridgePort})`);
