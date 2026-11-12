/* Spectator features use only the published DDT2 index. */
(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = m => `archive.html?${new URLSearchParams({round:m.round, match:m.id})}`;
  const selected = new Map();
  const introduced = new Set();
  const motion = () => !global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ease = 'cubic-bezier(.22,1,.36,1)';
  let bracketObserver;
  const rows = m => (m.lineup?.length ? m.lineup : m.draft_lineup?.length ? m.draft_lineup : m.draft?.roster || []).filter(p => !p.benched);
  const belongs = (m, id) => m.participants?.some(t => t?.id === id);
  const ended = m => Boolean(m.winner_id) || ['complete','forfeit'].includes(m.status);
  function featured(index, clubId) {
    const matches = (index.matches || []).filter(m => !clubId || belongs(m, clubId));
    const active = matches.filter(m => !ended(m) && m.status === 'in_progress');
    if (active.length) return {match:active[0], label:'Latest results', activeCount:0};
    const next = matches.find(m => !ended(m) && m.status === 'ready');
    if (next) return {match:next, label:clubId ? 'Your next match' : 'Upcoming match', activeCount:0};
    const review = matches.find(m => !ended(m) && m.status === 'needs_review');
    if (review) return {match:review, label:'Under review', activeCount:0};
    const final = [...matches].reverse().find(ended);
    return final ? {match:final, label:'Latest result', activeCount:0} : null;
  }
  function createPreference(getStorage) {
    const memory = new Map();
    return {
      key:event => `ddt:follow:${event}`,
      get(event, teams) {
        let id = memory.get(event) || '';
        if (!memory.has(event)) try { id = getStorage()?.getItem(this.key(event)) || ''; } catch {}
        return teams.some(t => t.id === id) ? id : '';
      },
      set(event, id) {
        memory.set(event, id);
        try { if (id) getStorage().setItem(this.key(event), id); else getStorage().removeItem(this.key(event)); return true; }
        catch { return false; }
      },
      external(event) { memory.delete(event); }
    };
  }
  const preference = createPreference(() => global.localStorage);
  function followButton(d, id) {
    const following = d.favorite === id;
    const name = d.index.teams.find(t => t.id === id)?.name || 'team';
    return `<button class="matchday-follow" type="button" data-follow="${esc(id)}" aria-pressed="${following}" aria-label="${following?'Unfollow':'Follow'} ${esc(name)}"><span aria-hidden="true">${following?'★':'☆'}</span> ${following?'Following':'Follow team'}</button>`;
  }
  function hub(d) {
    const club = d.index.teams.find(t => t.id === d.favorite);
    const item = featured(d.index, club?.id) || (club ? featured(d.index) : null);
    const m = item?.match;
    const round = m && d.index.rounds.find(r => r.id === m.round);
    return `<section class="matchday-hub" aria-label="Match updates and followed team">
      <div class="matchday-fixture"><p class="season-eyebrow">${esc(item?.label || 'Match updates')}</p>
        ${m ? `<a class="matchday-feature" href="${esc(url(m))}"><span class="matchday-versus">${m.participants.map(t => `<span>${esc(t?.name || 'Opponent to be confirmed')}<b>${esc(m.scores?.[t?.id] ?? '—')}</b></span>`).join('<i>VS</i>')}</span><span class="matchday-fixture-footer">${esc(round?.name || m.round)} <span>View match ↗</span></span></a>${item.activeCount > 1 ? `<a class="season-text-link" href="bracket.html">${item.activeCount} matches in progress →</a>` : ''}` : '<h2>Schedule to Be Announced</h2><p>Match details will appear here once fixtures are published.</p>'}
        <p class="matchday-sync" role="status">${d.syncError ? 'Updates unavailable. Showing the last loaded results.' : m ? 'Updates as results are published.' : ''}</p>
      </div>
      <div class="matchday-follow-panel"><label class="season-eyebrow" for="follow-club">${club ? 'Your team' : 'Follow your team'}</label>
        <select id="follow-club" ${d.index.teams.length ? '' : 'disabled'}><option value="">${d.index.teams.length ? 'Choose a team' : 'Teams to be announced'}</option>${d.index.teams.map(t => `<option value="${esc(t.id)}" ${club?.id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>
        ${club ? `<div class="matchday-follow-links"><a href="team.html?id=${encodeURIComponent(club.id)}">View team →</a><button type="button" data-follow="${esc(club.id)}" aria-label="Unfollow ${esc(club.name)}">Unfollow</button></div>` : '<p>Your team’s matches, one tap away.</p>'}
        <small role="status">${d.followNotice || 'Saved in this browser. No account needed.'}</small>
      </div>
    </section>`;
  }
  const identity = p => [p.team_id, p.variant_id || p.card_id || p.uma, p.display_name || p.owner, p.build_fingerprint || ''].join('|');
  const figure = p => global.UmaRaceArt?.figure(p) || '<span class="uma-art-placeholder" role="img" aria-label="Exact outfit artwork unavailable">◇</span>';
  function detail(p, d) {
    const artwork = global.UmaRaceArt?.resolve(p);
    const statLabels = [['speed','Speed'],['stamina','Stamina'],['power','Power'],['guts','Guts'],['wisdom','Wit']];
    return `<div class="matchday-build-art">${figure(p)}</div><div class="matchday-build-info">
      <p class="matchday-owner">${esc(p.display_name || p.owner || 'Player not announced')}</p><h3>${esc(p.uma || p.name || 'Uma not announced')}</h3>
      ${artwork ? `<p class="matchday-outfit">${esc(artwork.outfit_name)}</p>` : ''}
      <p class="matchday-style">Running style <strong>${esc(p.running_style || '—')}</strong></p>
      <dl class="matchday-stats">${statLabels.map(([key,label]) => `<div><dt>${label}</dt><dd>${esc(p.stats?.[key] ?? '—')}</dd></div>`).join('')}</dl>
      <div class="matchday-supports"><h4>Support Cards</h4>${p.support?.length ? `<ul>${p.support.map(s => `<li><span>${esc(d.supports?.cards?.[s.id]?.name || 'Support card '+s.id)}</span>${s.limit_breaks != null ? `<small>${esc(s.limit_breaks)} LB</small>` : ''}</li>`).join('')}</ul>` : '<p>Not available</p>'}</div>
    </div>`;
  }
  function group(d, team, lineup, key) {
    const players = lineup.filter(p => p.team_id === team?.id);
    const chosen = players.find(p => identity(p) === selected.get(key)) || players[0];
    const panelId = `build-${encodeURIComponent(key)}`;
    return `<section class="matchday-lineup" data-lineup-group="${esc(key)}"><header><a href="team.html?id=${encodeURIComponent(team.id)}">${esc(team.name)}</a>${followButton(d, team.id)}</header>
      ${players.length ? `<div class="matchday-picker" role="group" aria-label="${esc(team.name)} lineup">${players.map((p,i) => `<button type="button" data-runner="${i}" aria-pressed="${p===chosen}" aria-controls="${panelId}" aria-label="View ${esc(p.uma || p.name)}${p.display_name?' · '+esc(p.display_name):''}">${figure(p)}<span>${esc(p.uma || p.name)}</span></button>`).join('')}</div><div class="matchday-build" id="${panelId}" aria-live="polite" aria-atomic="true">${detail(chosen,d)}</div>` : '<div class="matchday-lineup-empty"><span aria-hidden="true">◇</span><h3>Lineup Not Announced</h3><p>Published Umas and builds will appear here.</p></div>'}
    </section>`;
  }
  function lineups(d, m, clubId) {
    const teams = (m.participants || []).filter(t => t && (!clubId || t.id === clubId));
    return `<div class="matchday-lineups ${teams.length===1?'is-single':''}" data-lineup-match="${esc(m.id)}">${teams.map(t => group(d,t,rows(m),`${m.round}:${m.id}:${t.id}`)).join('') || '<p class="season-no-data">Lineup not announced.</p>'}</div>`;
  }
  function clubLineup(d,id) {
    const m = [...d.index.matches].reverse().find(m => rows(m).some(p => p.team_id === id));
    return m ? `<a class="season-text-link" href="${esc(url(m))}">View match →</a>${lineups(d,m,id)}` : '<p class="season-no-data">No Uma builds have been submitted yet.</p>';
  }
  function pathMatches(index, id) {
    if (!index.teams.some(t => t.id === id)) return [];
    const order = new Map(index.rounds.map((r,i) => [r.id,i]));
    return index.matches.filter(m => belongs(m,id)).slice().sort((a,b) => (order.get(a.round) ?? Infinity)-(order.get(b.round) ?? Infinity));
  }
  const pathClub = d => d.index.teams.some(t => t.id === (d.bracketClub ?? d.favorite)) ? (d.bracketClub ?? d.favorite) : '';
  function pathSummary(d, id) {
    if (!id) return 'Choose a team to highlight its fixtures.';
    const matches = pathMatches(d.index,id), upcoming = matches.find(m => !ended(m) && ['ready','in_progress'].includes(m.status));
    return `${matches.length} published ${matches.length===1?'fixture':'fixtures'}${upcoming ? ` <a href="${esc(url(upcoming))}">${upcoming.status==='ready'?'Next match':'Latest results'} ↗</a>` : ''}`;
  }
  function bracketTools(d) {
    const id = pathClub(d);
    return `<div class="matchday-path-tools"><label for="bracket-club">Team path</label><select id="bracket-club"><option value="">All teams</option>${d.index.teams.map(t => `<option value="${esc(t.id)}" ${t.id===id?'selected':''}>${esc(t.name)}</option>`).join('')}</select><p class="matchday-path-summary" role="status">${pathSummary(d,id)}</p></div>`;
  }
  function paintBracket(root,d,animate=false) {
    const board = root.querySelector('.matchday-bracket-board');
    if (!board?.getBoundingClientRect) return;
    const id = pathClub(d), ids = new Set(pathMatches(d.index,id).map(m => m.id));
    board.dataset.hasClub = String(Boolean(id));
    const cards = [...board.querySelectorAll('[data-match-id]')];
    cards.forEach(card => {
      card.classList.toggle('is-club-path',ids.has(card.dataset.matchId));
      card.querySelectorAll('[data-club-id]').forEach(side => side.classList.toggle('is-path-team',side.dataset.clubId===id));
    });
    const summary=root.querySelector('.matchday-path-summary');
    if(summary) summary.innerHTML=pathSummary(d,id);
    const svg=board.querySelector('.matchday-path-lines'), origin=board.getBoundingClientRect();
    const stops=pathMatches(d.index,id).map(m=>cards.find(c=>c.dataset.matchId===m.id)).filter(Boolean);
    svg.setAttribute('viewBox',`0 0 ${board.scrollWidth} ${board.scrollHeight}`);
    svg.innerHTML=stops.slice(1).map((card,i)=>{
      const a=stops[i].getBoundingClientRect(),b=card.getBoundingClientRect();
      // Only join published appearances in successive columns; no projected advancement.
      if(b.left<a.right) return '';
      const x=a.right-origin.left,y=a.top+a.height/2-origin.top,xx=b.left-origin.left,yy=b.top+b.height/2-origin.top,mid=(x+xx)/2;
      return `<path d="M${x},${y} C${mid},${y} ${mid},${yy} ${xx},${yy}" pathLength="1"/>`;
    }).join('');
    if(animate && motion()) svg.querySelectorAll('path').forEach(p=>p.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:650,easing:ease}));
    if(animate && id) {
      const focusMatch=pathMatches(d.index,id).find(m=>!ended(m)&&['ready','in_progress'].includes(m.status));
      (cards.find(c=>c.dataset.matchId===focusMatch?.id)||stops[0])?.scrollIntoView({behavior:motion()?'smooth':'instant',block:'nearest',inline:'center'});
    }
  }
  function entrance(d,m) {
    const round=d.index.rounds.find(r=>r.id===m.round);
    return `<section class="matchday-entrance" data-match-entrance="${esc(m.round+':'+m.id)}" aria-label="Match score"><p class="matchday-entrance-round">${esc(round?.name || m.round)} <span>${esc(m.id.toUpperCase())}</span></p><div class="matchday-faceoff">${[0,1].map(i=>{
      const t=m.participants?.[i];
      return `<div class="matchday-contender"><span class="matchday-club-mark" aria-hidden="true">${esc(t?.name?.slice(0,1) || '—')}</span><div>${t?`<a href="team.html?id=${encodeURIComponent(t.id)}">${esc(t.name)}</a>`:'<span>Opponent to be confirmed</span>'}${t&&m.winner_id===t.id?'<small>Winner</small>':''}</div><strong>${esc(m.scores?.[t?.id] ?? '—')}</strong></div>`;
    }).join('<span class="matchday-faceoff-vs" aria-hidden="true">VS</span>')}</div></section>`;
  }
  function present(root,d,{enter=false}={}) {
    bracketObserver?.disconnect();
    paintBracket(root,d);
    const board=root.querySelector('.matchday-bracket-board');
    if(board?.getBoundingClientRect && global.ResizeObserver){bracketObserver=new global.ResizeObserver(()=>paintBracket(root,d));bracketObserver.observe(board);}
    const fixture=root.querySelector('[data-match-entrance]');
    if(enter && fixture?.dataset?.matchEntrance && !introduced.has(fixture.dataset.matchEntrance)) {
      introduced.add(fixture.dataset.matchEntrance);
      if(motion()) fixture.classList.add('is-entering');
    }
  }
  function selectRunner(panel,p,d,pick,direction) {
    panel.getAnimations?.({subtree:true}).forEach(a=>a.cancel());
    panel.innerHTML=detail(p,d);
    global.UmaRaceArt?.attachAll();
    const art=panel.querySelector?.('.matchday-build-art'),info=panel.querySelector?.('.matchday-build-info');
    const animate=motion();
    pick.scrollIntoView?.({behavior:animate?'smooth':'instant',block:'nearest',inline:'nearest'});
    if(!animate) return;
    // The character is the focal movement; the build stays readable throughout.
    (art||panel).animate?.([{opacity:.25,transform:`translateX(${direction*28}px) scale(.94)`},{opacity:1,transform:'none'}],{duration:460,easing:ease});
    info?.animate?.([{opacity:.55,transform:`translateX(${direction*8}px)`},{opacity:1,transform:'none'}],{duration:320,easing:ease});
  }
  function bind(root, getData, rerender) {
    root.addEventListener('change', e => {
      if(e.target.id==='bracket-club') {
        const d=getData(),id=e.target.value;
        if(id&&!d.index.teams.some(t=>t.id===id)) return;
        d.bracketClub=id;paintBracket(root,d,true);return;
      }
      if (e.target.id !== 'follow-club') return;
      follow(e.target.value);
    });
    root.addEventListener('keydown',e=>{
      const pick=e.target.closest('[data-runner]');
      if(!pick||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      const buttons=[...pick.closest('.matchday-picker').querySelectorAll('[data-runner]')],i=buttons.indexOf(pick);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      e.preventDefault();buttons[next].focus({preventScroll:true});buttons[next].click();
    });
    function follow(id) {
      const d = getData();
      if (id && !d.index.teams.some(t => t.id === id)) return;
      const persisted = preference.set(d.event.id,id);
      d.favorite = id;
      d.followNotice = persisted ? '' : 'Saved for this visit. Browser storage is unavailable.';
      rerender();
    }
    root.addEventListener('click', async e => {
      const followControl = e.target.closest('[data-follow]');
      if (followControl) { follow(getData().favorite===followControl.dataset.follow?'':followControl.dataset.follow); return; }
      const pick = e.target.closest('[data-runner]');
      if (pick) {
        const d = getData(), groupEl = pick.closest('[data-lineup-group]');
        const matchEl = groupEl.closest('[data-lineup-match]');
        const m = d.index.matches.find(m => m.id === matchEl.dataset.lineupMatch);
        const team = m?.participants.find(t => t && `${m.round}:${m.id}:${t.id}` === groupEl.dataset.lineupGroup);
        const p = rows(m || {}).filter(p => p.team_id === team?.id)[Number(pick.dataset.runner)];
        if (!p || pick.getAttribute?.('aria-pressed') === 'true' || selected.get(groupEl.dataset.lineupGroup) === identity(p)) return;
        const previous=[...groupEl.querySelectorAll('[data-runner]')].find(b=>b.getAttribute?.('aria-pressed')==='true');
        selected.set(groupEl.dataset.lineupGroup, identity(p));
        groupEl.querySelectorAll('[data-runner]').forEach(b => b.setAttribute('aria-pressed',String(b===pick)));
        const panel = groupEl.querySelector('.matchday-build');
        selectRunner(panel,p,d,pick,Number(pick.dataset.runner)<Number(previous?.dataset.runner)?-1:1);
      }
      const share = e.target.closest('[data-share-match]');
      if (share) {
        const target = new URL(share.dataset.shareMatch,global.location.href).href;
        try { await global.navigator.clipboard.writeText(target); share.textContent='Link copied'; }
        catch { const input = root.querySelector('.matchday-share-url'); input.hidden=false; input.value=target; input.focus(); input.select(); }
      }
    });
    global.addEventListener('storage', e => {
      const d = getData();
      if (d && (e.key===preference.key(d.event.id) || e.key===null)) { preference.external(d.event.id); d.favorite=preference.get(d.event.id,d.index.teams); rerender(); }
    });
  }
  const api = {featured,createPreference,preference,followButton,hub,lineups,clubLineup,detail,bind,pathMatches,bracketTools,paintBracket,entrance,present};
  global.DDT2Matchday = api;
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);
