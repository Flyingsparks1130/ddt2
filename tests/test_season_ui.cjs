'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const UI=require('../assets/ddt2-app.js');
const data={index:require('../data/tournament-index.json'),stats:require('../data/tournament-statistics.json'),event:require('../config/event.json'),params:new URLSearchParams()};
assert.deepEqual(data.index.teams,[]);assert.deepEqual(data.index.rounds,[]);assert.deepEqual(data.index.matches,[]);
for(const [key,view] of Object.entries(UI.views)){
 const html=view(data);assert(!/undefined|NaN/.test(html),key);assert(!/Dominator Player|Dominion|Domichill|Quarterfinals|Semifinals|Trophy room|Award/i.test(html),key);
 assert(/<h1/.test(html),key);
}
assert.match(UI.views.home(data),/06/);assert.match(UI.views.rules(data),/>6<\/strong>/);
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
