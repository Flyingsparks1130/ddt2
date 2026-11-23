import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {crc32,deflateRawSync} from 'node:zlib';
import skillIcons from '../assets/skill-icons.json' with {type:'json'};
import {representativeCard} from './ddt2.mjs';
import skills from '../assets/skill-names.json' with {type:'json'};
import {heatFor,requireThat,totals} from './domain.mjs';
import {seriesRows} from './series.mjs';
import {umaFor} from './broadcast.mjs';

export const roundName=m=>({R1:'Round 1',R2:'Round 2 / Quarterfinals',R3:'Semifinals',R4:'Grand Final'})[m?.siteRoundId]||m?.round||'';
export const raceName=n=>n===7?'Tiebreaker':'Race '+n;

export function matchExport(bundle,matchId){
 const match=bundle.series?.matches.find(m=>m.id===matchId);
 requireThat(match?.siteMatchId&&(match.raceCount||match.manualOverride||match.decision),'Choose a bracket match with an approved result.');
 const results=bundle.results.filter(r=>r.match.id===matchId);
 const standings=Object.fromEntries([['players','player'],['teams','team']].map(([key,group])=>[key,totals(results,group,bundle.tournament.scoring.tiebreak)]));
 return {...bundle,results,standings,voided:[],series:{...bundle.series,matches:[match]}};
}

// One UTF-8 JSON entry with standard ZIP headers, CRC-32 and raw DEFLATE.
export function packageZip(bundle){
 const name=Buffer.from('approved-results.json'),data=Buffer.from(JSON.stringify(bundle));
 const compressed=deflateRawSync(data),sum=crc32(data);
 const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);
 local.writeUInt32LE(sum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);local.copy(central,6,4,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
 end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+compressed.length,16);
 return Buffer.concat([local,name,compressed,central,name,end]);
}

export function runnerBuild(h={}){
 const r=h.responseHorseData||{},c=h.trainedCharaData||{},p=h.raceParam||{};
 const stats={},aptitudes={};
 for(const [label,param,key] of [['Speed','rawSpeed','speed'],['Stamina','rawStamina','stamina'],['Power','rawPow','power'],['Guts','rawGuts','guts'],['Wit','rawWiz','wiz']]){
  const value=p[param]??c[key]??r[key];if(Number.isFinite(value))stats[label]=value;
 }
 for(const [label,key] of Object.entries({Turf:'ground_turf',Dirt:'ground_dirt',Sprint:'distance_short',Mile:'distance_mile',Medium:'distance_middle',Long:'distance_long',Front:'running_style_nige',Pace:'running_style_senko',Late:'running_style_sashi',End:'running_style_oikomi'})){
  const camel='proper'+key.split('_').map(k=>k[0].toUpperCase()+k.slice(1)).join('');
  const grade=r['proper_'+key]??c[camel];if(Number.isInteger(grade)&&grade>=1&&grade<=8)aptitudes[label]='GFEDCBAS'[grade-1];
 }
 const list=r.skill_array??c.skillArray??[];
 return {stats,aptitudes,support:(c.supportCardArray||[]).map(s=>({id:s.supportCardId??s.support_card_id??s.id})).filter(s=>Number.isInteger(s.id)),skills:list.map(s=>{
  const id=s.skill_id??s.skillId;
  const [icon,rarity]=skillIcons[id]||[];
  return {id,name:skills[id]||s.name||('Skill '+id),level:s.level??s.skill_level??null,icon,rarity};
 })};
}

export function finalized(state,heatId){
 if(!heatId)return null;
 const {match,heat}=heatFor(state,heatId);
 const race=seriesRows(state,match).find(r=>r.heatId===heatId);
 if(!race)return null;
 return {match:match.name,round:roundName(match),race:raceName(heat.number),manual:race.manual,
  rows:race.rows.map(r=>({...r,uma:umaFor(r.card||match.lineup?.[r.playerId],r.name),
   teamCard:representativeCard(state.tournament.teams?.find(t=>t.id===r.teamId)||{},state.tournament.id)}))};
}
export async function highlight(state,directory,choice){
 if(!choice)return null;
 const race=state.races.find(r=>r.id===choice.raceId&&r.status!=='void');
 const row=race?.runners.find(r=>r.index===choice.index);
 if(!race||!row||!/^([0-9a-f]{64})$/.test(race.fingerprint))return null;
 const raw=JSON.parse(await readFile(path.join(directory,'raw',race.fingerprint+'.json'),'utf8'));
 const player=state.tournament.players.find(p=>p.id===race.mapping?.[row.index]);
 return {player:player?.name||row.trainer,team:player?.team,
  uma:umaFor(row.card,row.name)||{name:row.name},...runnerBuild(raw.raceHorse[row.index])};
}


export async function enrichPackage(bundle,directory){
 const match=bundle.series.matches[0],builds={};
 for(const result of [...bundle.results].sort((a,b)=>a.heat.number-b.heat.number)){
  if(result.rows.every(row=>builds[row.playerId]))continue;
  requireThat(/^[a-f0-9]{64}$/.test(result.fingerprint),'Invalid capture fingerprint.');
  let capture;
  try{capture=JSON.parse(await readFile(path.join(directory,'raw',result.fingerprint+'.json'),'utf8'));}
  catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const row of result.rows){if(!builds[row.playerId]&&capture.raceHorse?.[row.index])builds[row.playerId]=runnerBuild(capture.raceHorse[row.index]);}
 }
 match.builds=builds;return bundle;
}
