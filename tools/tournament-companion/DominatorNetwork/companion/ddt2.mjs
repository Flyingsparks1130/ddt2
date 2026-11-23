import {readFile} from 'node:fs/promises';
import seed from './ddt2-seed.json' with {type:'json'};
import {digest,requireThat,text} from './domain.mjs';

export const destination={owner:'Flyingsparks1130',repo:'ddt2',branch:'main',file:'data/companion/approved-results.json'};
const base='https://raw.githubusercontent.com/Flyingsparks1130/ddt2/';
export const bracketStages = Object.freeze({R1:'Round 1', R2:'Round 2 / Quarterfinals', R3:'Semifinals', R4:'Grand Final'});
export function bracketPreview(source) {
 const teams = new Map(source.tournament.teams.map(t => [t.id, t.name]));
 const matches = new Map(source.index.matches.map(m => [m.id, m]));
 return Object.entries(bracketStages).map(([id, name]) => ({
  name, matches: source.tournament.matches.filter(m => m.round === id).map(m => ({
   id: m.id, sides: m.sources.map((side, i) => {
    const team = matches.get(m.id)?.participants?.[i]?.id || side.team;
    return teams.get(team) || 'Winner of ' + side.winner_of.toUpperCase();
   })
  }))
 }));
}
export function validateSource(source){
 const t=source?.tournament;
 requireThat(t?.id==='ddt2'&&Array.isArray(t.teams)&&Array.isArray(t.matches)&&Array.isArray(t.rounds),'The source is not the DDT2 tournament.');
 requireThat(t.teams.length<=32&&t.matches.length<=256,'The published roster or bracket is too large.');
 requireThat(JSON.stringify(t.scoring?.points_by_place)==='[4,2,1]'&&t.scoring.target_points===25&&t.scoring.standard_races===6&&t.scoring.players_per_team===5&&t.scoring.expected_entries===10&&t.scoring.auto_finalize===false,'DDT2 rules changed. Review the new format before importing.');
 const teams=new Set(),players=new Set();
 for(const team of t.teams){requireThat(/^[\w-]{1,60}$/.test(team.id)&&!teams.has(team.id),'Published team IDs must be unique.');teams.add(team.id);text(team.name,'Team name',100);requireThat(Array.isArray(team.members)&&team.members.length===5,'Each DDT2 team needs five registered players.');
  for(const member of team.members){const name=text(member.display_name,'Registered player',100);const key=team.id+':'+name.toLowerCase();requireThat(!players.has(key),'A team contains a duplicate player.');players.add(key);}
 }
 requireThat(source.index?.tournament?.id==='ddt2'||source.index?.id==='ddt2','The generated bracket belongs to a different event.');
 return source;
}
export async function sourcePreview(offline=false,fetcher=fetch){
 let source;
 if(offline)source=JSON.parse(await readFile(new URL('./ddt2-seed.json',import.meta.url),'utf8'));
 else{
  const get=async (url,optional=false)=>{const r=await fetcher(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'DDT2-Companion'},signal:AbortSignal.timeout(12000),redirect:'error'});if(optional&&r.status===404)return null;requireThat(r.ok,`DDT2 download failed (${r.status}). Use the bundled roster while offline.`,502);const body=await r.text();requireThat(body.length<5*1024*1024,'Published DDT2 data is too large.');return JSON.parse(body);};
  const ref=await get('https://api.github.com/repos/Flyingsparks1130/ddt2/git/ref/heads/main');const commit=ref.object?.sha;requireThat(/^[a-f0-9]{40}$/.test(commit),'GitHub returned an invalid revision.');
  const [tournament,index,event]=await Promise.all([get(base+commit+'/Dominator%20Tournament/tournament.json'),get(base+commit+'/data/tournament-index.json'),get(base+commit+'/config/event.json')]);const bracket=await get(base+commit+'/data/companion/bracket-slots.json',true);
  if(bracket)for(const m of index.matches){const ids=bracket[m.id];if(ids)m.participants=m.participants.map((team,i)=>team||tournament.teams.find(t=>t.id===ids[i])||null);}
  source={commit,tournament,index,teamArtwork:event.team_artwork||{}};
 }
 validateSource(source);return {source,hash:digest(source),offline,teamCount:source.tournament.teams.length,playerCount:source.tournament.teams.reduce((n,t)=>n+t.members.length,0),matchCount:source.tournament.matches.length};
}
export function representativeCard(team, tournamentId) {
 if (tournamentId !== 'ddt2') return null;
 if (Object.hasOwn(team, 'representativeCard')) return team.representativeCard;
 return seed.teamArtwork[team.id]?.card || null;
}
export function importDDT2(state,source){
 validateSource(source);
 requireThat(state.tournament.id==='ddt2'||(!state.matches.length&&!state.races.length&&!state.publications.length),'This desk contains another tournament. Preserve it before connecting DDT2.');
 const t=source.tournament,old=state.tournament.players,players=[];
 if(state.matches.length)for(const team of state.tournament.teams||[])requireThat(t.teams.some(t=>t.id===team.id&&t.name.toLowerCase()===team.name.toLowerCase()),'A team identity changed on DDT2. Review the existing series before replacing the roster.');
 for(const team of t.teams)for(const member of team.members){
  const sourceKey=team.id+':'+member.display_name.toLowerCase();const prior=old.find(p=>p.sourceKey===sourceKey);
  players.push({...prior,id:prior?.id||'ddt2-'+digest(sourceKey).slice(0,20),sourceKey,name:member.display_name,gameName:prior?.gameName||'',team:team.name,teamId:team.id});
 }
 const inUse=new Set(state.matches.flatMap(m=>m.playerIds));
 for(const prior of old)if(!players.some(p=>p.id===prior.id)&&inUse.has(prior.id))players.push({...prior,retired:true});
 state.tournament={...state.tournament,id:'ddt2',name:'DDT2 · Dominator Draft Tournament',teams:t.teams.map(team=>({id:team.id,name:team.name,representativeCard:(source.teamArtwork??seed.teamArtwork)[team.id]?.card||null})),players,rules:{points:[4,2,1],tiebreak:'shared',aggregation:'sum',unlistedPlaces:0},seriesFormat:{standardRaces:6,maxRaces:7,target:25,entries:10,playersPerTeam:5}};
 state.github={...destination};state.corrections||=[];state.manualHeats||=[];
 const generated=source.index.matches||[];const imported=[];const deferred=[];
 for(const raw of t.matches){
  const published=generated.find(m=>m.id===raw.id);
  const teamIds=(published?.participants?.map(p=>p?.id)||raw.sources?.map(s=>s.team)||[]).filter(Boolean);
  if(teamIds.length!==2||new Set(teamIds).size!==2||!teamIds.every(id=>t.teams.some(t=>t.id===id))){deferred.push(raw.id);continue;}
  const found=state.matches.find(m=>m.siteMatchId===raw.id);
  if(found){requireThat(JSON.stringify(found.teamIds)===JSON.stringify(teamIds),`Published participants changed for ${found.name}. Review that series before syncing.`);continue;}
  const matchId='ddt2-'+raw.id;requireThat(/^[\w-]{1,80}$/.test(matchId),'Published match ID is invalid.');
  const round=t.rounds.find(r=>r.id===raw.round);
  const match={id:matchId,siteMatchId:raw.id,siteRoundId:raw.round,name:teamIds.map(id=>t.teams.find(t=>t.id===id).name).join(' vs '),round:round?.name||raw.round,stage:bracketStages[raw.round],teamIds,playerIds:players.filter(p=>teamIds.includes(p.teamId)&&!p.retired).map(p=>p.id),expected:{},heats:Array.from({length:7},(_,i)=>({id:matchId+'-race-'+(i+1),number:i+1,tiebreaker:i===6,expected:{}}))};
  requireThat(match.playerIds.length===10,'A published match does not have ten registered players.');state.matches.push(match);imported.push(match.id);
 }
 state.site={repository:'Flyingsparks1130/ddt2',commit:source.commit,syncedAt:new Date().toISOString(),bracket:bracketPreview(source),pendingMatchIds:deferred,bracketPublished:!!t.published};
 return {teams:t.teams.length,players:players.length,addedMatches:imported.length,deferredMatches:deferred.length};
}
