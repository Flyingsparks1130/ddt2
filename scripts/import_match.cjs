'use strict';
const fs=require('node:fs'),path=require('node:path'),{merge}=require('../assets/match-package.js');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data','companion');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),dest=path.join(dir,'approved-results.json');
const incoming=read(process.argv[2]),index=read(path.join(root,'data/tournament-index.json'));
const {bundle,slots}=merge(index,fs.existsSync(dest)?read(dest):null,incoming);
for(const [filename,data] of [[dest,bundle],[path.join(dir,'bracket-slots.json'),slots]])fs.writeFileSync(filename,JSON.stringify(data,null,2)+'\n');
console.log('Validated '+incoming.series.matches[0].name);
