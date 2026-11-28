const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.TEST_PLAYWRIGHT);

async function test() {
  const install = path.join(process.argv[2], 'DominatorNetwork', 'companion');
  const profile = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'Broadcaster '));
  const directory = path.join(profile, 'DominatorTournament');
  const pidFile = path.join(directory, 'companion-process.json');
  const origin = 'http://127.0.0.1:27840';
  const env = {SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    PATH: path.join(process.env.SystemRoot, 'System32'), TEMP: profile, TMP: profile,
    USERPROFILE: profile, LOCALAPPDATA: profile, APPDATA: profile};
  // A pre-DDT2 desk with one pending, unassigned capture blocked 0.6.12 imports.
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'tournament.json'), JSON.stringify({
    schema: 1, revision: 3, tournament: {id:'local', name:'DOMINATOR NETWORK', rules:null, players:[]},
    matches: [], activeHeatId:null, armedHeatId:null, audit:[], publications:[],
    github: {owner:'', repo:'', branch:'', file:''}, watch:{folder:'',enabled:false},
    races:[{id:'existing-capture',filename:'capture.json',status:'pending',heatId:null,runners:[],mapping:{}}]
  }));
  let browser;
  try {
    execFileSync(path.join(install,'Start Tournament Companion.exe'),['--start-only'],
      {cwd:install,env,windowsHide:true,timeout:45000});
    browser = await chromium.launch({channel:'msedge',headless:true});
    const page = await browser.newPage();
    await page.goto(origin);
    const pairs = ['Dominate vs Dominare','Domimommy vs Dominion','Dominante vs Domimoon','Dominium vs Domineer'];
    await page.waitForFunction(()=>document.querySelector('#match-select')?.options.length===5);
    const menu = page.locator('#match-select');
    assert.deepEqual((await menu.locator('option').allTextContents()).slice(1),pairs);
    for (const [i,name] of pairs.entries()) {
      const matchId='ddt2-r1-m'+(i+1);
      await menu.selectOption(matchId);
      await page.locator('#heat-select').selectOption(matchId+'-race-1');
      await page.locator('#select-heat').click();
      await page.waitForFunction(name=>document.querySelector('#active-title').textContent===name,name);
      console.log('Race Desk activated '+name+' / Race 1');
    }
    await page.locator('[data-tab="roster"]').click();
    await page.locator('#site-offline').click();
    await page.locator('#site-import').click();
    await page.waitForFunction(()=>document.querySelector('#site-preview-text').textContent==='4 matchups ready in Race Desk.');
    const state=await (await page.request.get(origin+'/api/ops/state')).json();
    assert.equal(state.matches.length,4);
    assert.equal(state.races[0].id,'existing-capture');
    assert.equal(state.publication.tokenAvailable,false);
    assert.equal(state.activeHeatId,'ddt2-r1-m4-race-1');
    console.log('Reviewed import retained the four matchups, active race, and original inbox capture.');
  } finally {
    if(browser)await browser.close();
    if(fs.existsSync(pidFile))process.kill(JSON.parse(fs.readFileSync(pidFile)).pid);
  }
}
test().catch(error=>{console.error(error);process.exitCode=1;});
