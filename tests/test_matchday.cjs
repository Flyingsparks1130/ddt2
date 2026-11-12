'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../assets/ddt2-matchday.js'),UI=require('../assets/ddt2-app.js');
const teams=[{id:'a',name:'Preview Club A'},{id:'b',name:'Preview Club B'},{id:'c',name:'Preview Club C'}];
const match=(id,status,extra={})=>({id,round:'R1',status,participants:teams.slice(0,2),scores:{a:9,b:4},...extra});
const data={event:{id:'ddt2',prize:{count:6}},index:{id:'ddt2',teams,rounds:[{id:'R1',name:'Opening round'}],matches:[]},params:new URLSearchParams(),stats:{},supports:{cards:{30028:{name:'[Fire at My Heels] Kitasan Black'}}}};
assert.equal(M.featured(data.index),null);
data.index.matches=[match('pending','awaiting_opponent'),match('next','ready'),match('active','in_progress')];
assert.equal(M.featured(data.index).match.id,'active');
assert.equal(M.featured(data.index).label,'Latest results');
assert.equal(M.featured(data.index,'c'),null);
data.index.matches[2].winner_id='a';
assert.equal(M.featured(data.index).match.id,'next','A recorded winner takes precedence over a stale status');
data.index.matches[1].status='needs_review';
assert.equal(M.featured(data.index).label,'Under review','Unverified results are never presented as final');
data.index.matches[1].winner_id='b';
assert.equal(M.featured(data.index).label,'Latest result');

const storage=new Map(),store={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const prefs=M.createPreference(()=>store);
assert.equal(prefs.set('ddt2','a'),true);
assert.equal(prefs.get('ddt2',teams),'a');
assert.equal(M.createPreference(()=>store).get('ddt2',teams),'a','Follow survives reload');
assert.equal(prefs.get('other-event',teams),'','Follow is scoped to the event');
assert.equal(prefs.get('ddt2',[teams[1]]),'','A removed club is never displayed as followed');
prefs.set('ddt2','');assert.equal(prefs.get('ddt2',teams),'');
const blocked=M.createPreference(()=>{throw Error('blocked');});
assert.equal(blocked.set('ddt2','b'),false);assert.equal(blocked.get('ddt2',teams),'b');
blocked.set('ddt2','');assert.equal(blocked.get('ddt2',teams),'');

const players=[{team_id:'a',uma:'Gentildonna',display_name:'Player A',variant_id:111601,stats:{speed:1200},support:[{id:30028,limit_breaks:4}]},
 {team_id:'a',uma:'<Runner B>',display_name:'Player B',variant_id:100601,stats:{speed:0},benched:true},
 {team_id:'b',uma:'Gold Ship',display_name:'Player C',variant_id:100701}];
data.index.matches=[match('m','ready',{lineup:players})];data.params=new URLSearchParams('match=m&round=R1');
let html=UI.views.archive(data);
assert.match(html,/data-runner="0"/);assert.match(html,/Support Cards/);assert.match(html,/Kitasan Black/);
assert(!html.includes('Runner B'),'Benched Uma must not be selectable');
assert.match(html,/Copy match link/);assert(!/undefined|NaN/.test(html));
assert.match(M.detail(players[1],data),/&lt;Runner B&gt;/);assert.match(M.detail(players[1],data),/>0<\/dd>/);
assert.match(M.detail(players[2],data),/>—<\/dd>/,'Missing stats stay unknown');
data.favorite='a';assert.match(M.hub(data),/<option value="a" selected>/);
assert.match(M.followButton(data,'a'),/aria-pressed="true"/);
data.index.matches[0].lineup=[];assert.match(M.lineups(data,data.index.matches[0]),/Lineup Not Announced/);
assert.match(UI.views.clubs(data),/data-follow="a"/);
assert(!/\bLive\b/.test(M.hub(data)),'A published fixture is not a live race feed');
console.log('Matchday: published status, follow persistence, event isolation, missing data, supports, escaping and bench filtering passed.');

// A club route includes actual published participants, never a projected winner.
{
 const first=match('opening','in_progress',{scores:{a:99,b:0}}),next=match('next','ready',{round:'R2',participants:[teams[0],teams[2]]});
 const unresolved=match('unresolved','awaiting_opponent',{round:'R3',participants:[null,teams[2]]});
 const d={...data,favorite:'a',index:{...data.index,rounds:[{id:'R1'},{id:'R2'},{id:'R3'}],matches:[unresolved,next,first]}};
 assert.deepEqual(M.pathMatches(d.index,'a').map(m=>m.id),['opening','next']);
 assert.deepEqual(M.pathMatches(d.index,'missing'),[]);
 assert.match(M.bracketTools(d),/<option value="a" selected>/);
 assert(!M.entrance(d,first).includes('<small>Winner</small>'),'Scores cannot imply a winner');
 assert.match(M.entrance(d,{...first,winner_id:'b'}),/<small>Winner<\/small>/);
 assert.match(M.entrance(d,unresolved),/Opponent to be confirmed/);
 assert(!/undefined|NaN/.test(M.entrance(d,unresolved)));
 const classes=()=>({values:new Set(),toggle(k,v){v?this.values.add(k):this.values.delete(k);}});
 const cards=[first,next,unresolved].map((m,i)=>({dataset:{matchId:m.id},classList:classes(),
  getBoundingClientRect:()=>({left:20+i*350,right:315+i*350,top:50,height:260}),
  querySelectorAll:()=>[],scrollIntoView(){throw Error('Passive redraw must not move the page');}}));
 const svg={innerHTML:'',setAttribute(){},querySelectorAll:()=>[]};
 const board={dataset:{},scrollWidth:1000,scrollHeight:400,getBoundingClientRect:()=>({left:20,top:0}),querySelectorAll:()=>cards,querySelector:()=>svg};
 const summary={innerHTML:''},root={querySelector:s=>s==='.matchday-bracket-board'?board:summary};
 M.paintBracket(root,d);
 assert(cards[0].classList.values.has('is-club-path'));assert(cards[1].classList.values.has('is-club-path'));assert(!cards[2].classList.values.has('is-club-path'));
 assert.equal((svg.innerHTML.match(/<path /g)||[]).length,1,'Only confirmed appearances are connected');
 assert.match(summary.innerHTML,/2 published fixtures/);
 d.bracketClub='';M.paintBracket(root,d);assert.equal(svg.innerHTML,'');assert.equal(board.dataset.hasClub,'false');
 assert(cards.every(c=>!c.classList.values.has('is-club-path')),'All clubs clears the route');
 console.log('Club path: published appearances, round order, follow default, unknown opponents and no inferred advancement passed.');
}

// Exercise actual click/change handlers, including outfit selection and unfollowing.
{
 const handlers={},browser={localStorage:store,addEventListener(){},matchMedia:()=>({matches:false}),UmaRaceArt:{attachAll(){},resolve:()=>null,figure:()=>'<span>◇</span>'}};
 const context={window:browser,URLSearchParams};vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../assets/ddt2-matchday.js'),'utf8'),context);
 const d={...data,favorite:'',index:{...data.index,matches:[match('m','ready',{lineup:[players[0],{...players[1],benched:false}]})]}};
 let updates=0,animations=0;
 const root={addEventListener:(name,fn)=>handlers[name]=fn};
 browser.DDT2Matchday.bind(root,()=>d,()=>updates++);
 handlers.change({target:{id:'follow-club',value:'a'}});assert.equal(d.favorite,'a');assert.equal(store.getItem('ddt:follow:ddt2'),'a');
 handlers.click({target:{closest:s=>s==='[data-follow]'?{dataset:{follow:'a'}}:null}});assert.equal(d.favorite,'');assert.equal(updates,2);
 const buttons=[0,1].map(i=>({dataset:{runner:String(i)},setAttribute(k,v){this[k]=v;}}));
 const panel={innerHTML:'',animate(){animations++;}};
 const group={dataset:{lineupGroup:'R1:m:a'},closest:()=>({dataset:{lineupMatch:'m'}}),querySelectorAll:()=>buttons,querySelector:()=>panel};
 buttons[1].closest=()=>group;
 handlers.click({target:{closest:s=>s==='[data-runner]'?buttons[1]:null}});
 assert.equal(buttons[1]['aria-pressed'],'true');assert.equal(buttons[0]['aria-pressed'],'false');assert.match(panel.innerHTML,/&lt;Runner B&gt;/);assert.equal(animations,1);
 handlers.click({target:{closest:s=>s==='[data-runner]'?buttons[1]:null}});
 assert.equal(animations,1,'Selecting the current Uma does not replay its entrance');
 assert.match(browser.DDT2Matchday.lineups(d,d.index.matches[0]),/data-runner="1" aria-pressed="true"/,'Selected build survives redraws');
 // Directional keys select and wrap without moving focus out of the roster.
 let focused=-1;buttons.forEach((b,i)=>{b.focus=()=>focused=i;b.click=()=>handlers.click({target:{closest:s=>s==='[data-runner]'?b:null}});b.closest=s=>s==='.matchday-picker'?{querySelectorAll:()=>buttons}:group;b.getAttribute=k=>b[k];});
 let prevented=false;
 handlers.keydown({key:'ArrowRight',target:{closest:()=>buttons[1]},preventDefault(){prevented=true;}});
 assert(prevented);assert.equal(focused,0);assert.equal(buttons[0]['aria-pressed'],'true');
 const animated=animations;browser.matchMedia=()=>({matches:true});let rosterScroll;
 buttons[1].scrollIntoView=options=>rosterScroll=options;
 handlers.keydown({key:'End',target:{closest:()=>buttons[0]},preventDefault(){}});
 assert.equal(focused,1);assert.equal(animations,animated,'Reduced motion selects immediately without an entrance');
 assert.equal(rosterScroll.behavior,'instant','Reduced motion still brings the selected roster button into view');
 // Match intros run once per fixture per visit, never on refresh or a draft tab switch.
 browser.matchMedia=()=>({matches:false});let entrances=0;
 const fixture={dataset:{matchEntrance:'R1:m'},classList:{add(){entrances++;}}},stageRoot={querySelector:s=>s==='[data-match-entrance]'?fixture:null};
 browser.DDT2Matchday.present(stageRoot,d,{enter:true});browser.DDT2Matchday.present(stageRoot,d,{enter:true});browser.DDT2Matchday.present(stageRoot,d);
 assert.equal(entrances,1);
 fixture.dataset.matchEntrance='R2:m2';browser.matchMedia=()=>({matches:true});browser.DDT2Matchday.present(stageRoot,d,{enter:true});assert.equal(entrances,1);
 console.log('Matchday interactions: choose/unfollow club, switch runner, selected state, animation and redraw persistence passed.');
}

// Polling must retain the last published data on failure and update only from the same event.
(async()=>{
 const listeners={},location=new URL('https://example.test/ddt2/index.html');let poll,renders=0,response=data.index,failed=false,rendered='';
 const root={addEventListener(){},querySelector:()=>({focus(){}}),querySelectorAll:()=>[],set innerHTML(v){rendered=v;renders++;}};
 const scene={},document={body:{dataset:{}},hidden:false,getElementById:id=>id==='season-root'?root:null,querySelector:()=>scene,querySelectorAll:()=>[],addEventListener:(k,fn)=>listeners[k]=fn};
 const browser={addEventListener:(k,fn)=>listeners[k]=fn,setInterval:fn=>{poll=fn;},localStorage:store};
 const context={window:browser,document,location,URL,URLSearchParams,console,DDT2:{header:()=>'',footer:()=>''},matchMedia:()=>({matches:true}),Image:class{decode(){return Promise.resolve();}},fetch:async p=>{if(failed)throw Error('Offline');return {ok:true,json:async()=>p.includes('index')?response:p.includes('event')?data.event:p.includes('support')?data.supports:{}};}};
 vm.createContext(context);
 for(const file of ['ddt2-matchday.js','ddt2-guide.js','ddt2-app.js'])vm.runInContext(fs.readFileSync(require.resolve('../assets/'+file),'utf8'),context);
 await new Promise(r=>setImmediate(r));const initial=renders;
 await poll();assert.equal(renders,initial,'Unchanged data does not interrupt the page');
 failed=true;await poll();assert.match(rendered,/Updates unavailable/);assert.match(rendered,/Preview Club A/);
 failed=false;response={...data.index,matches:[match('fresh','ready')]};await poll();assert.match(rendered,/match=fresh/);assert(!rendered.includes('Updates unavailable'));
 const current=renders;document.hidden=true;await poll();assert.equal(renders,current,'Background pages do not poll');
 document.hidden=false;response={...response,id:'another-event',teams:[]};await poll();assert.match(rendered,/Preview Club A/,'Another event cannot replace DDT2');
 console.log('Matchday polling: unchanged data, offline fallback, recovery, background pause and event validation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
