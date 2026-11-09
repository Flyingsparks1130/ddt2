'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const UI=require('../assets/ddt2-app.js');
const data={index:require('../data/tournament-index.json'),stats:require('../data/tournament-statistics.json'),event:require('../config/event.json'),params:new URLSearchParams()};
assert.deepEqual(data.index.teams,[]);assert.deepEqual(data.index.rounds,[]);assert.deepEqual(data.index.matches,[]);
for(const [key,view] of Object.entries(UI.views)){
 const html=view(data);assert(!/undefined|NaN/.test(html),key);assert(!/Dominator Player|Dominion|Domichill|Quarterfinals|Semifinals|Trophy room|Award/i.test(html),key);
 assert(/<h1/.test(html),key);
}
assert.match(UI.views.home(data),/>6<\/strong>/);assert.match(UI.views.rules(data),/>6<\/strong>/);
assert.match(UI.views.bracket(data),/Bracket not published/);assert.match(UI.views.clubs(data),/Clubs to be announced/);
assert.match(UI.views.stats(data),/Standings will appear/);assert.match(UI.views.stats(data),/No data recorded/);
// Future data remains functional and cannot fabricate a winner from a high score.
const future=JSON.parse(JSON.stringify(data));future.params=new URLSearchParams('id=a');
future.index.teams=[{id:'a',name:'<Club A>'},{id:'b',name:'Club B'}];future.index.rounds=[{id:'R1',name:'Opening round'}];
const match={id:'r1-m1',round:'R1',participants:future.index.teams,status:'in_progress',winner_id:null,scores:{a:99,b:1},draft_lineup:[{team_id:'a',uma:'Gentildonna',variant_id:111602,benched:false}],races:[]};future.index.matches=[match];
assert.deepEqual(UI.record(future,'a'),{wins:0,losses:0,points:0});assert.match(UI.views.bracket(future),/&lt;Club A&gt;/);assert(!UI.views.bracket(future).includes('<Club A>'));
match.winner_id='b';match.loser_id='a';assert.deepEqual(UI.record(future,'a'),{wins:0,losses:1,points:99});
const html=UI.views.stats(future);assert.match(html,/Club B/);assert.match(html,/Club standings/);
console.log('DDT2 views: clean season, future fixtures, official winner decisions, six prizes, missing statistics and escaped names passed.');

// The interactive guide is a self-contained example, never a tournament mutation.
{
 const vm=require('node:vm'),handlers={},browser={matchMedia:()=>({matches:false})},context={window:browser};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../assets/ddt2-guide.js'),'utf8'),context);
 const guide=browser.DDT2Guide;
 for(let mask=0;mask<8;mask++){
  const podium=[0,1,2].map(i=>mask&(1<<i)?'a':'b'),score=guide.totals(podium);
  assert.equal(score.a+score.b,7,'All podium assignments conserve the seven race points');
  assert.equal(score.a,podium.reduce((sum,t,i)=>sum+(t==='a'?[4,2,1][i]:0),0));
 }
 const untouched=JSON.stringify(data.index);let animations=0,cancelled=0,focused=-1;
 const steps=Array.from({length:6},(_,i)=>({dataset:{guideStep:String(i)},setAttribute(k,v){this[k]=v;},focus(){focused=i;}}));
 const moves=[-1,1].map(i=>({dataset:{guideMove:String(i)}})),position={textContent:''};
 const panel={innerHTML:'',getAnimations:()=>[{cancel(){cancelled++;}}],querySelector:()=>({animate(){animations++;}})};
 const scoreButtons=[0,1,2].flatMap(i=>['a','b'].map(t=>({dataset:{scorePlace:String(i),scoreTeam:t},setAttribute(k,v){this[k]=v;}})));
 const totals={a:{textContent:4},b:{textContent:3}},fractions={},lanes=Object.fromEntries(['a','b'].map(t=>[t,{style:{setProperty(k,v){fractions[t]=v;}}}])),announcement={textContent:''};
 const root={addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll:s=>s==='[data-guide-step]'?steps:s==='[data-guide-move]'?moves:scoreButtons,
  querySelector:s=>s==='#draft-stage'?panel:s==='[data-guide-position]'?position:s==='[data-score-announcement]'?announcement:s.startsWith('[data-score-total')?totals[s.includes('"a"')?'a':'b']:lanes[s.includes('"a"')?'a':'b']};
 guide.bind(root);
 const click=(selector,element)=>handlers.click({target:{closest:s=>s===selector?element:null}});
 click('[data-guide-step]',steps[5]);assert.match(panel.innerHTML,/Train in Unity Cup/);assert.equal(moves[1].disabled,true);
 click('[data-guide-step]',steps[1]);assert.match(panel.innerHTML,/six remaining tracks/);assert.equal(position.textContent,'Stage 2 of 6');assert.equal(steps[1]['aria-pressed'],'true');
 assert.equal(cancelled,2,'Rapid selections cancel the old illustration and render immediately');
 click('[data-guide-step]',steps[1]);assert.equal(cancelled,2,'The current stage does not replay');
 handlers.keydown({key:'Home',target:{closest:()=>steps[1]},preventDefault(){}});assert.equal(focused,0);assert.equal(moves[0].disabled,true);
 click('[data-guide-move]',moves[0]);assert.equal(position.textContent,'Stage 1 of 6','Previous at the first stage is bounded');
 const before=animations;browser.matchMedia=()=>({matches:true});click('[data-guide-step]',steps[4]);assert.equal(animations,before);assert.match(panel.innerHTML,/remaining Uma is benched/);
 assert.match(guide.walkthrough(),/data-guide-step="4" aria-pressed="true"/,'Stage choice survives a page redraw');
 handlers.toggle({target:{classList:{contains:()=>true},open:true}});assert.match(guide.walkthrough(),/guide-transcript" open/,'Expanded written steps survive refresh');
 click('[data-score-place]',scoreButtons[2]);assert.equal(totals.a.textContent,6);assert.equal(totals.b.textContent,1);
 click('[data-score-place]',scoreButtons[4]);assert.equal(totals.a.textContent,7);assert.equal(totals.b.textContent,0);assert.equal(fractions.a,1);assert.equal(fractions.b,0);
 assert.equal(announcement.textContent,'Team A: 7 points. Team B: 0 points.');
 assert.match(guide.scoring(),/data-score-place="2" data-score-team="a" aria-pressed="true"/,'Example choices survive redraw');
 click('[data-score-place]',{dataset:{scorePlace:'9',scoreTeam:'c'}});assert.equal(totals.a.textContent,7);
 assert.equal(JSON.stringify(data.index),untouched,'The scoring illustration cannot change published data');
 console.log('Interactive guide: all scoring combinations, immediate stage changes, bounded controls, keyboard, reduced motion and redraw persistence passed.');
}

// Exercise the real controller: hash history must not replace the page or reset its scroll.
(async()=>{
 const vm=require('node:vm'),listeners={},location=new URL('https://example.test/ddt2/stats.html#build-stats');
 let renders=0,scrolls=0,anchors=0,animations=0;
 const root={set innerHTML(value){renders++;},addEventListener(){},querySelector:()=>({focus(){}}),querySelectorAll:()=>[],animate(){animations++;}};
 const scene={},section={scrollIntoView(){anchors++;}},document={
  body:{dataset:{}},getElementById:id=>id==='season-root'?root:id==='build-stats'?section:null,
  querySelector:()=>scene,querySelectorAll:()=>[],addEventListener:(name,fn)=>{listeners['document:'+name]=fn;}
 };
 const browser={addEventListener:(name,fn)=>{listeners[name]=fn;},scrollTo(){scrolls++;}};
 const context={window:browser,document,location,URL,URLSearchParams,console,
  DDT2:{header:()=>'',footer:()=>''},matchMedia:()=>({matches:true}),
  history:{pushState:(_state,_unused,url)=>{location.href=url.href;}},
  Image:class{decode(){return Promise.resolve();}},
  fetch:async path=>({ok:true,json:async()=>path.includes('index')?data.index:path.includes('statistics')?data.stats:data.event})
 };
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../assets/ddt2-matchday.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../assets/ddt2-guide.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../assets/ddt2-app.js'),'utf8'),context);
 await settle();assert.equal(anchors,1,'Direct section links scroll after data loads');
 const before=renders;location.hash='standings';listeners.popstate();await settle();
 assert.equal(renders,before,'Hash navigation preserves the rendered page');assert.equal(scrolls,0,'Hash navigation preserves native scrolling');
 function click(href){listeners['document:click']({button:0,target:{closest:()=>({href,hasAttribute:()=>false})},preventDefault(){}});}
 click('https://example.test/ddt2/bracket.html');await settle();assert.equal(document.body.dataset.section,'bracket');
 click('https://example.test/ddt2/stats.html#build-stats');await settle();assert.equal(anchors,2,'Cross-page section links reach their target');
 assert.equal(animations,0,'Device reduced-motion preference also covers the fallback transition');
 let cancelled=0;const active=[];
 context.matchMedia=()=>({matches:false});
 root.getAnimations=()=>active.filter(a=>!a.cancelled);
 root.animate=()=>{animations++;const a={cancelled:false,cancel(){this.cancelled=true;cancelled++;}};active.push(a);return a;};
 click('https://example.test/ddt2/clubs.html');click('https://example.test/ddt2/bracket.html');click('https://example.test/ddt2/rules.html');
 assert.equal(document.body.dataset.section,'rules','Rapid clicks reach the latest destination immediately');
 assert(cancelled>=2,'New navigation cancels earlier entrance animations');
 click('https://example.test/ddt2/clubs.html');click('https://example.test/ddt2/rules.html');
 assert.equal(document.body.dataset.section,'rules','Returning to the starting page is not ignored');
 click('https://example.test/ddt2/bracket.html');click('https://example.test/ddt2/rules.html#draft-process');
 assert.equal(document.body.dataset.section,'rules');assert.equal(location.hash,'#draft-process');
 console.log('Navigation: same-page anchors, direct section links, cross-page section links and reduced motion passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
