#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
let index=read('data/tournament-index.json');const docs={};
if(fs.existsSync(path.join(root,'data/companion/approved-results.json'))){
 const bundle=require('../assets/companion-contract.js').validate(read('data/companion/approved-results.json'),'ddt2');
 if(bundle.series){
  index=require('../assets/series-contract.js').apply(index,bundle);
  for(const m of index.matches){
   const s=m.companion_series;if(!s)continue;
   for(const r of bundle.results.filter(r=>r.match.id===s.id)){
    const id='companion:'+r.fingerprint;
    if(m.races.some(f=>docs[f.id]?.raw_sha256===r.fingerprint))continue;
    m.races.push({id});
    docs[id]={scoring_verified:true,raw_sha256:r.fingerprint,results:r.rows.map(row=>{
     const build=s.builds?.[row.playerId]||{};
     return {eligible:true,team_id:row.teamId,owner:row.playerName,uma:row.name,variant_id:row.card,stats:Object.fromEntries(Object.entries(build.stats||{}).map(([k,v])=>[k==='Wit'?'wisdom':k.toLowerCase(),v])),skills:build.skills,support:build.support,running_style_code:row.style,
      aptitudes:Object.fromEntries(Object.entries(build.aptitudes||{}).map(([k,v])=>[k.toLowerCase(),v]))};
    })};
   }
  }
 }
}
for(const m of index.matches)for(const f of m.races)if(f.data_file)docs[f.id]=read(f.data_file);
const catalogues={supports:read('assets/support-cards.json').cards,portraits:read('assets/uma-portraits.json'),skills:read('assets/award-skills.json').skills,skillMeta:read('assets/skill-metadata.json')};
const statistics=require('./tournament_statistics.cjs').compute(index,docs,catalogues);
// Only reference artwork actually bundled in this static site.
for(const key of ['support','skills','fielded','veto','preban','umas_ran'])for(const row of statistics[key])if(row.image&&!fs.existsSync(path.join(root,row.image)))row.image=null;
const standings=null; // Awards are not part of DDT2's public statistics.
const snapshot={schema_version:1,revision:index.revision,generated_at:index.generated_at,standings,statistics};
fs.writeFileSync(path.join(root,'data/tournament-statistics.json'),JSON.stringify(snapshot)+'\n');
console.log(JSON.stringify({revision:index.revision,revealed:!!standings,coverage:statistics.coverage}));
