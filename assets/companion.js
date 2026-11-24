'use strict';
siteHeader(''); siteFooter();
const contract = CompanionContract;
let teamArtwork, runnerPortraits={};
const byId = id => document.getElementById(id);
const localTools = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
byId('local-preview').hidden = !localTools;
byId('local-preview-help').hidden = !localTools;
let connection = null, current = null, generation = 0, downloadURL = null;
const status = (message, state = '') => {
  byId('connection-status').textContent = message;
  byId('connection-status').dataset.state = state;
};
function clear() {
  current = null; byId('results').replaceChildren(); byId('results').hidden = true;
  byId('event-name').textContent = 'Live results'; byId('download').hidden = true;
  if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = null;
}
async function readJSON(response) {
  if (Number(response.headers.get('content-length')) > contract.MAX_BYTES) throw new Error('Export exceeds 10 MB.');
  const raw = await response.text();
  if (new Blob([raw]).size > contract.MAX_BYTES) throw new Error('Export exceeds 10 MB.');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}
async function loadConnection() {
  const response = await fetch('config/companion.json', {cache:'no-store'});
  if (!response.ok) throw new Error(`Connection settings could not be loaded (HTTP ${response.status}).`);
  return contract.config(await readJSON(response));
}
async function published() {
  const request = ++generation;
  clear(); byId('end-preview').hidden = true; status('Loading results…');
  try {
    const settings = await loadConnection(); if (request !== generation) return;
    connection = settings;
    const response = await fetch(settings.resultsPath, {cache:'no-store'});
    if (request !== generation) return;
    if (response.status === 404) {
      status('No race results published yet.'); return;
    }
    if (!response.ok) throw new Error(`Results could not be loaded (HTTP ${response.status}).`);
    const bundle = contract.validate(await readJSON(response), settings.expectedTournamentId);
    if (request !== generation) return;
    display(bundle, false);
  } catch (error) {
    if (request === generation) { clear(); status(error.message, 'error'); }
  }
}
async function preview(file) {
  if (!file) return;
  const request = ++generation;
  clear(); byId('end-preview').hidden = false; status('Reading local preview…', 'preview');
  try {
    if (file.size > contract.MAX_BYTES) throw new Error('Export exceeds 10 MB.');
    const settings = await loadConnection();
    const bundle = contract.validate(JSON.parse((await file.text()).replace(/^\uFEFF/, '')), settings.expectedTournamentId);
    if (request !== generation) return;
    connection = settings; display(bundle, true);
  } catch (error) {
    if (request === generation) { clear(); status(error.message, 'error'); }
  } finally { byId('preview-file').value = ''; }
}
function roundLabel(match) {
  const label=match.round||match.stage||'';
  return ({R1:'Round 1',R2:'Round 2 / Quarterfinals',R3:'Semifinals',R4:'Grand Final'})[label.toUpperCase()]||label;
}
function display(bundle, isPreview) {
  current = bundle; byId('results').hidden = false;
  byId('event-name').textContent = bundle.tournament.name;
  const last = bundle.results.map(r => r.approvedAt).sort((a,b) => Date.parse(b)-Date.parse(a))[0];
  status(isPreview ? 'LOCAL PREVIEW · This export is visible only on this device. Nothing has been published.' :
    `Published results${last ? ' · Updated ' + new Date(last).toLocaleString() : ' · No races yet'}.`, isPreview ? 'preview' : '');
  downloadURL = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2) + '\n'], {type:'application/json'}));
  byId('download').href = downloadURL; byId('download').download = 'approved-results.json'; byId('download').hidden = !localTools;
  const matches = [...new Map([...bundle.results.map(r => [r.match.id, r.match]), ...(bundle.series?.matches||[]).map(m=>[m.id,m])]).values()];
  const rules = bundle.tournament.scoring;
  byId('results').innerHTML = `
    <div class="cp-summary">
      <div class="cp-stat"><strong>${bundle.results.length}</strong><span>Completed races</span></div>
      <div class="cp-stat"><strong>${matches.length}</strong><span>Matches with results</span></div>
      <div class="cp-stat"><strong>${bundle.standings.players.length}</strong><span>Players</span></div>
    </div>
    <details class="cp-panel"><summary>Scoring Format</summary>${rules ? `
      <ul class="cp-rule-points">${rules.points.map((n,i) => `<li>Place ${i+1} <strong>+${esc(n)}</strong></li>`).join('')}</ul>
      <p class="cp-meta">Points add across approved Uma entries. Unlisted places receive 0 points. Ties: ${rules.tiebreak === 'countback' ? 'countback by finishing position' : 'shared rank'}.</p>
      <p class="cp-meta">Each heat keeps the scoring rules used at approval. These totals do not decide bracket advancement.</p>` :
      '<p class="cp-meta">Scoring rules have not been announced.</p>'}</details>
    <div class="cp-filter"><label for="match-select">Show results for</label><select id="match-select"><option value="">All matches · event totals</option>${matches.map(m => `<option value="${esc(m.id)}">${esc([roundLabel(m),m.name].filter(Boolean).join(' · '))}</option>`).join('')}</select></div>
    <div id="match-results"></div>
    ${bundle.voided.length ? `<details class="cp-panel cp-audit"><summary>Voided races (${bundle.voided.length}) · excluded from scores</summary><ul>${bundle.voided.map(v => `<li>${esc(v.reason)}<br>Race ${esc(v.raceId)}${v.heatId ? ' · Heat '+esc(v.heatId) : ''}</li>`).join('')}</ul></details>` : ''}`;
  const selected = new URLSearchParams(location.search).get('match');
  if (matches.some(m => m.id === selected)) byId('match-select').value = selected;
  byId('match-select').addEventListener('change', () => { renderMatches(); });
  renderMatches();
  if(location.hash==='#race-results')byId('race-results')?.scrollIntoView();
}
function table(headers, rows) {
  return `<div class="cp-table-wrap"><table class="cp-table"><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function standingTable(entries, label) {
  return `<section class="cp-panel"><h2>${esc(label)}</h2>${entries.length ? table(['Rank','Name','Points','Uma entries'], entries.map(e =>
    `<tr><td>${e.rank}</td><th scope="row" class="cp-name">${label === 'Team Standings' ? window.DDT2Matchday?.teamCrest(e.name,teamArtwork) || '' : ''}${esc(e.name)}</th><td>${esc(e.points)}</td><td>${e.entries}</td></tr>`).join('')) : '<p class="cp-meta">No scored entries in this selection.</p>'}</section>`;
}
function renderMatches() {
  if (!current) return;
  const selected = byId('match-select').value;
  const results = current.results.filter(r => !selected || r.match.id === selected);
  const requestedRace=Number(new URLSearchParams(location.search).get('race'));
  const featuredRace=results.find(r=>r.heat.number===requestedRace)||results[0];
  const ties = current.tournament.scoring?.tiebreak;
  const players = contract.standings(results, 'players', ties), teams = contract.standings(results, 'teams', ties);
  const link = connection.matchLinks.find(m => m.companionMatchId === selected);
  const fixture=current.series?.matches.find(m=>m.id===selected);
  const archiveURL = fixture?.siteMatchId ? 'archive.html?'+new URLSearchParams({round:fixture.siteRoundId,match:fixture.siteMatchId}) : link ? `archive.html?${new URLSearchParams({round:link.archiveRoundId,match:link.archiveMatchId})}` : null;
  const series = (current.series?.matches||[]).filter(m=>!selected||m.id===selected);
  const seriesHTML = series.map(m=>`<section class="cp-panel"><h2>${esc(m.name)} · Series score</h2><p>${m.teams.map(t=>`${esc(t.name)} <strong>${t.points}</strong>`).join(' — ')}</p><p class="cp-meta">First to 25 · ${m.raceCount} approved races · ${m.winnerId?'Winner confirmed: '+esc(m.teams.find(t=>t.id===m.winnerId).name):'Outcome awaits operator confirmation'}</p>${m.manualOverride?`<p class="cp-meta">Static scores approved by ${esc(m.manualOverride.approval.operator)}: ${esc(m.manualOverride.reason)}</p>`:''}${m.races.filter(r=>r.manual).map(r=>`<details><summary>Race ${r.number} · Manual podium</summary><p>${r.rows.map(p=>`${p.rank}. ${esc(p.playerName)} (${p.points})`).join(' · ')}</p><p>${esc(r.reason)} · Approved by ${esc(r.operator)}</p></details>`).join('')}</section>`).join('');
  byId('match-results').innerHTML = `
    ${seriesHTML}
    ${archiveURL ? `<p><a class="cp-link" href="${esc(archiveURL)}">View match details →</a></p>` : ''}
    <details class="cp-panel"><summary>Standings</summary><div class="cp-standings">${standingTable(players,'Player Standings')}${standingTable(teams,'Team Standings')}</div></details>
    <h2>Race Results</h2>
    ${results.length ? [...results].sort((a,b) => a.match.id.localeCompare(b.match.id) || a.heat.number-b.heat.number).map(r => `
      <details class="cp-panel race-drilldown" ${r===featuredRace?'open id="race-results"':''}><summary>
        <span class="race-number">Race ${esc(r.heat.number)}</span>
        <span class="race-course"><strong>${esc(contract.course(r.track).split(' · ')[0])}</strong><small>${esc(contract.course(r.track).split(' · ').slice(1).join(' · '))}</small></span>
        <span class="race-context">${esc(roundLabel(r.match))} · ${esc(r.match.name)}</span>
      </summary>
        ${table(['Place','Portrait','Player','Umamusume','Team','Time','Points'], [...r.rows].sort((a,b) => a.rank-b.rank).map(row => {
          const variant=window.UmaRaceArt?.resolve(row);
          const image=variant&&Number.isInteger(Number(row.card))&&runnerPortraits[row.card];
          const millis=Math.round(row.finishTime*1000);
          const finish=Math.floor(millis/60000)+':'+String(Math.floor(millis/1000)%60).padStart(2,'0')+'.'+String(millis%1000).padStart(3,'0');
          return `<tr><td>${row.rank}</td><td>${image?`<img class="cp-runner-portrait" src="${esc(image)}" alt="">`:''}</td><td>${esc(row.playerName)}</td><td class="cp-name">${esc(variant?.character_name||row.name)}<small class="cp-meta">${esc(variant?.outfit_name||'')}</small></td><td>${window.DDT2Matchday?.teamCrest(row.teamId||row.team,teamArtwork) || ''}${esc(row.team||'—')}</td><td>${finish}</td><td>${esc(row.points)}</td></tr>`;
        }).join(''))}
        <p class="cp-meta race-approval">Approved by ${esc(r.operator)} · ${esc(new Date(r.approvedAt).toLocaleString())}</p>
      </details>`).join('') : '<section class="cp-panel"><h2>No Race Results Yet</h2><p class="cp-meta">Results will appear after the first race.</p></section>'}`;
  window.UmaRaceArt?.attachAll();
}
if (window.DDT2Matchday) {
  fetch('assets/race-labels.json').then(r=>r.json()).then(labels=>{runnerPortraits=labels.portraits||{};if(current)renderMatches();}).catch(()=>{});
  fetch('config/event.json').then(response=>response.ok?response.json():null).then(event=>{
    teamArtwork=event?.team_artwork;
    if(current && teamArtwork)renderMatches();
  }).catch(()=>{});
}
window.UmaRaceArt?.load().then(()=>{if(current)renderMatches();});
byId('refresh').addEventListener('click', published);
byId('end-preview').addEventListener('click', published);
byId('preview-file').addEventListener('change', event => preview(event.target.files[0]));
window.addEventListener('pagehide', () => { if (downloadURL) URL.revokeObjectURL(downloadURL); });
published();
