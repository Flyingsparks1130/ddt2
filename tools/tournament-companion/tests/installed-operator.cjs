const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');
const {chromium} = require(process.env.TEST_PLAYWRIGHT);
const game = path.resolve(process.argv[2]);
const installed = path.join(game,'DominatorNetwork','companion');
const origin = 'http://127.0.0.1:27840';

function verifyPackage(){
 const paths=fs.readdirSync(path.join(game,'DominatorNetwork'),{recursive:true})
   .map(p=>'DominatorNetwork/'+p.replaceAll('\\','/'))
   .filter(p=>/^DominatorNetwork\/(companion|web)\//.test(p)&&/(\.js|\.mjs|\.html|\.json|\/node\.exe)$/.test(p)).sort();
 const hash=crypto.createHash('sha256');
 for(const p of paths){
  const raw=fs.readFileSync(path.join(game,p));
  const data=p.endsWith('.exe')?raw:Buffer.from(raw.toString('utf8').replace(/\r+\n/g,'\n'));
  hash.update(p+':'+crypto.createHash('sha256').update(data).digest('hex')+'\n');
 }
 assert.equal(hash.digest('hex'),'d5b3d10562b77183dc34b4ad39da6b0b896bc1fcd62e8478d0ce7d8ea28f6373');
 console.log('All '+paths.length+' tested Helper runtime, browser and connection files match the organizer ZIP.');
}

async function check(mode){
 const profile=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'Operator '+mode+' '));
 const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.SystemRoot+'\\System32',TEMP:profile,TMP:profile,USERPROFILE:profile,LOCALAPPDATA:profile,APPDATA:profile};
 if(mode==='offline')Object.assign(env,{NODE_USE_ENV_PROXY:'1',HTTPS_PROXY:'http://127.0.0.1:1',HTTP_PROXY:'http://127.0.0.1:1',NO_PROXY:'127.0.0.1,localhost'});
 const state=async()=>{const r=await fetch(origin+'/api/ops/state',{headers:{connection:'close'}});assert.equal(r.status,200);return r.json();};
 const pidFile=path.join(profile,'DominatorTournament','companion-process.json');
 let browser;
 try{
  execFileSync(path.join(installed,'Start Tournament Companion.exe'),['--start-only'],{cwd:installed,env,windowsHide:true,timeout:45000});
  for(let i=0;i<80&&!fs.existsSync(pidFile);i++)await delay(100);
  assert.ok(fs.existsSync(pidFile),'the packaged launcher must start its own desk');
  assert.equal((await state()).version,'0.6.12');
  assert.equal((await state()).matches.length,0);
  assert.equal((await state()).publication.tokenAvailable,false);
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();
  await page.goto(origin);
  await page.locator('[data-tab="roster"]').click();
  if(mode==='offline'){
   const denied=page.waitForResponse(r=>r.url().endsWith('/api/ops/ddt2-preview'));
   await page.locator('#site-preview').click();assert.equal((await denied).status(),502);
  }
  const url=mode==='live'?'/api/ops/ddt2-preview':'/api/ops/ddt2-preview?offline=1';
  const ready=page.waitForResponse(r=>r.url().endsWith(url));
  await page.locator(mode==='live'?'#site-preview':'#site-offline').click();
  const response=await ready,data=await response.json();
  assert.equal(response.status(),200,JSON.stringify(data));assert.equal(data.offline,mode==='offline');
  assert.equal(data.teamCount,12);assert.equal(data.playerCount,60);
  assert.equal((await state()).matches.length,0,'preview alone does not import fixtures');
  await page.locator('#site-import').click();
  await page.waitForFunction(()=>document.querySelector('#site-status').textContent==='DDT2 connected');
  await page.locator('[data-tab="show"]').click();
  await page.locator('#match-select').selectOption('ddt2-r1-m1');
  const id='ddt2-r1-m1-race-1';
  await page.locator('#heat-select').selectOption(id);
  await page.locator('#select-heat').click();
  await page.waitForFunction(()=>document.querySelector('#active-title').textContent==='Dominate vs Dominare');
  const result=await state();assert.equal(result.activeHeatId,id);
  console.log(mode+': '+data.teamCount+' teams; '+data.playerCount+' players; '+result.matches.length+' selectable matchups; broadcast Dominate vs Dominare Race 1; no operator GitHub credentials.');
 }finally{
  if(browser)await browser.close();
  if(fs.existsSync(pidFile)){const pid=JSON.parse(fs.readFileSync(pidFile)).pid;process.kill(pid);for(let i=0;i<50;i++){try{process.kill(pid,0)}catch{break}await delay(100)}}
 }
}
const mode=process.argv[3];
if(mode)check(mode).catch(e=>{console.error(e);process.exitCode=1});
else{
 verifyPackage();
 for(const scenario of ['live','offline']){
  execFileSync(process.execPath,[__filename,game,scenario],{stdio:'inherit'});
 }
}
