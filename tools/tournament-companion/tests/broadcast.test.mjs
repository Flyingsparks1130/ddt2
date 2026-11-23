import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialState} from '../DominatorNetwork/companion/domain.mjs';
import {importDDT2} from '../DominatorNetwork/companion/ddt2.mjs';
import {broadcastState,saveLineup,umaFor} from '../DominatorNetwork/companion/broadcast.mjs';
import {draftManualHeat,manualReview,approveManual,draftCorrection,correctionReview,approveCorrection} from '../DominatorNetwork/companion/series.mjs';
const source=JSON.parse(await readFile(new URL('../DominatorNetwork/companion/ddt2-seed.json',import.meta.url),'utf8'));
function setup(){const s=initialState();importDDT2(s,source);const teams=s.tournament.teams.slice(0,2),m={id:'fixture',name:'Fixture only',round:'Test',stage:'TEST',teamIds:teams.map(t=>t.id),playerIds:s.tournament.players.filter(p=>teams.some(t=>t.id===p.teamId)).map(p=>p.id),heats:Array.from({length:7},(_,i)=>({id:'h'+(i+1),number:i+1}))};s.matches.push(m);s.activeHeatId='h1';return {s,m,a:m.playerIds.slice(0,5),b:m.playerIds.slice(5)};}
function approve(s,heatId,podium){const d=draftManualHeat(s,{heatId,podium,reason:'Synthetic test'});const r=manualReview(s,d);approveManual(s,{manualId:d.id,reviewHash:r.hash,operator:'Test',broadcastFinished:true});return d;}
test('lineups require exact outfits and one valid entry per player, and never affect points',()=>{const {s,m}=setup();const entries=m.playerIds.map((playerId,i)=>({playerId,card:i?null:100602}));saveLineup(s,{heatId:'h1',entries});const view=broadcastState(s,{});assert.equal(view.series.teams[0].players[0].uma.outfit,'Ashen Miracle');assert.equal(view.series.teams[0].players[1].uma,null);assert.deepEqual(view.series.teams.map(t=>t.points),[0,0]);assert.throws(()=>saveLineup(s,{heatId:'h1',entries:entries.slice(1)}));assert.throws(()=>saveLineup(s,{heatId:'h1',entries:entries.map(()=>entries[0])}));assert.throws(()=>saveLineup(s,{heatId:'h1',entries:entries.map(e=>({...e,card:999999}))}));assert.equal(umaFor(100601).outfit,'Starlight Beat');assert.equal(umaFor(999999,'Unknown variant').art,null);});
test('cumulative columns and last podium exclude pending and void races, and preserve manual totals separately',()=>{const {s,m,a,b}=setup();saveLineup(s,{heatId:'h1',entries:m.playerIds.map(playerId=>({playerId,card:100601}))});approve(s,'h1',[a[0],b[0],b[1]]);draftManualHeat(s,{heatId:'h2',podium:[b[0],a[0],a[1]],reason:'Pending fixture'});let view=broadcastState(s,{});assert.deepEqual(Object.values(view.columns[0].cumulative),[4,3]);assert.equal(view.columns[1].played,false);assert.equal(view.previous.number,1);assert.equal(view.previous.podium[0].uma.card,100601);assert.throws(()=>saveLineup(s,{heatId:'h1',entries:m.playerIds.map(playerId=>({playerId,card:null}))}),/already approved/);s.manualHeats.pop();approve(s,'h2',[b[0],a[0],a[1]]);view=broadcastState(s,{});assert.deepEqual(Object.values(view.columns[1].cumulative),[7,7]);assert.deepEqual(view.previous.podium.map(p=>p.points),[4,2,1]);assert.equal(view.previous.number,2);const c=draftCorrection(s,{matchId:m.id,kind:'score',scores:{[m.teamIds[0]]:20,[m.teamIds[1]]:18},reason:'Synthetic correction'});approveCorrection(s,{correctionId:c.id,reviewHash:correctionReview(s,c).hash,operator:'Test',confirm:true});view=broadcastState(s,{});assert.deepEqual(view.series.teams.map(t=>t.points),[20,18]);assert.deepEqual(Object.values(view.columns[1].cumulative),[7,7]);assert(view.series.manualOverride);s.manualHeats[1].status='void';view=broadcastState(s,{});assert.equal(view.previous.number,1);assert.equal(view.columns[1].played,false);});
test('approved recorded card wins over pre-race selection, pending data cannot leak to art or podium',()=>{const {s,m,a}=setup();saveLineup(s,{heatId:'h1',entries:m.playerIds.map(playerId=>({playerId,card:100601}))});const player=s.tournament.players.find(p=>p.id===a[0]);const result={match:{id:m.id},heat:{number:1},rows:[{rank:1,card:100602,playerId:player.id,playerName:player.name,teamId:player.teamId,team:player.team,points:4}]};s.races.push({id:'recorded',heatId:'h1',status:'pending',approval:{result}});assert.equal(broadcastState(s,{}).series.teams[0].players[0].uma.card,100601);assert.equal(broadcastState(s,{}).previous,null);s.races[0].status='approved';const view=broadcastState(s,{});assert.equal(view.series.teams[0].players[0].uma.card,100602);assert.equal(view.previous.podium[0].uma.outfit,'Ashen Miracle');s.activeHeatId=null;assert.equal(broadcastState(s,{}).series,null);});

test('the matchup lineup covers every race and keeps selections on the original match',()=>{
 const {s,m}=setup();
 m.heats[1].lineup={[m.playerIds[1]]:100602};
 s.activeHeatId=m.heats[0].id;
 assert.equal(broadcastState(s,{}).series.teams[0].players[1].uma.card,100602);
 const entries=m.playerIds.map((playerId,i)=>({playerId,card:i===0?101001:null}));
 saveLineup(s,{matchId:m.id,entries});
 for(const heat of m.heats){
  s.activeHeatId=heat.id;
  assert.equal(broadcastState(s,{}).series.teams[0].players[0].uma.outfit,'Wild Frontier');
  assert.equal(heat.lineup,undefined);
 }
 const other=s.matches.find(match=>match.id!==m.id);
 s.activeHeatId=other.heats[0].id;
 assert(broadcastState(s,{}).series.teams.every(team=>team.players.every(p=>!p.uma)));
});
