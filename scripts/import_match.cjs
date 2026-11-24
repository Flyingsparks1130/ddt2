'use strict';
const fs=require('node:fs'),path=require('node:path'),{merge}=require('../assets/match-package.js');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data','companion');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),dest=path.join(dir,'approved-results.json');
const courses = require('../tools/tournament-companion/DominatorNetwork/assets/courses.json');
const courseNames = new Map(courses.map(course => [course.id, course.name]));

const sameFields = (left, right, fields) => fields.every(field => left[field] === right[field]);

async function verifyCaptures(incoming, captures) {
  const match = incoming.series?.matches?.[0];
  if (incoming.series?.matches?.length !== 1 || match.status !== 'confirmed' ||
      !match.winnerId || match.decision?.status !== 'approved' || match.decision.winnerId !== match.winnerId) {
    throw Error('Finalize the entire matchup before importing it.');
  }
  const remaining = new Set(fs.readdirSync(captures));
  const {readRace} = await import('../tools/tournament-companion/DominatorNetwork/companion/domain.mjs');
  for (const result of incoming.results) {
    const name = 'race-' + result.heat.number + '.json';
    if (!remaining.delete(name)) throw Error('Missing or repeated capture: ' + name);
    const raw = fs.readFileSync(path.join(captures, name), 'utf8').replace(/^\uFEFF/, '');
    const parsed = readRace(JSON.parse(raw));
    const finishers = new Map(parsed.runners.map(row => [row.index, row]));
    if (parsed.fingerprint !== result.fingerprint ||
        !sameFields(parsed.track, result.track, ['id','distance','surface','going','weather','season']) ||
        parsed.runners.length !== result.rows.length ||
        !result.rows.every(row => finishers.has(row.index) &&
          sameFields(finishers.get(row.index), row, ['gate','rank','card','finishTime']))) {
      throw Error(name + ' does not match its approved race.');
    }
    result.track.name = courseNames.get(parsed.track.id) || parsed.track.name || result.track.name;
  }
  if (remaining.size) throw Error('Unmatched capture: ' + [...remaining].join(', '));
}

async function importMatch(filename) {
  const incoming = read(filename);
  await verifyCaptures(incoming, path.join(path.dirname(filename), 'races'));
  const index = read(path.join(root, 'data/tournament-index.json'));
  const {bundle, slots} = merge(index, fs.existsSync(dest) ? read(dest) : null, incoming);
  for (const [file, data] of [[dest, bundle], [path.join(dir, 'bracket-slots.json'), slots]]) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  console.log('Validated ' + incoming.series.matches[0].name);
}

module.exports = {verifyCaptures};
if (require.main === module) importMatch(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
