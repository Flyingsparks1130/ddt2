# DDT2

[Live site](https://flyingsparks1130.github.io/ddt2/) · [Race artwork library](https://github.com/Flyingsparks1130/uma-race-art)

Dominator Draft Tournament 2 starts November 29, 2026. Dominator, Dominare, Domineer, Dominium, DomiMoon and Dominance have registered five players each. The bracket, rounds and matchups remain unconfirmed; no drafts, builds or results have been submitted. The Rulebook includes the organizer's five-trainer draft format, Unity Cup build requirements and 4/2/1 scoring to 25 points. The prize pool is six Discord Nitro prizes; allocation and match times are to be announced.

## Public interface

`assets/ddt2-app.js` renders Home, Bracket, Drafts, Teams, Stats and Rules from the current event data. In-page navigation preserves the shared scene and changes between two genuine Gentildonna racewear poses. Browser history and direct page URLs remain usable. The standalone live-results and organizer tools retain normal navigation. Motion is enabled without a site toggle; device accessibility preferences are respected.

The crimson gradient, gold flourishes and character-filled title follow Yoi-Koi’s supplied visual. Artwork credits are in `docs/artwork-credits.md`.

## Event data

Team pages show registered players before any bracket or Uma lineup is announced. Interactive match and team lineups let visitors select an Uma to inspect the exact outfit, submitted stats, running style and available support cards. Only non-benched entries in published lineups are shown. Follow a team from its card, team page or match lineup; the choice is saved per event in that browser, with an in-memory fallback when storage is unavailable.

Home and Bracket prioritize the followed team's published match information. The page checks for updates every 60 seconds while visible, keeps its last good data on network failure and refreshes when the tab becomes visible. This is published-result coverage, not a live race feed. Publishing permissions are unchanged, and the site never advances a winner automatically. Match links can be copied for sharing.

- `Dominator Tournament/tournament.json`: current teams, registered players, rounds, match structure and prize metadata. Teams can be registered while the bracket remains unconfirmed; empty rounds and matches are valid.
- `Dominator Tournament/control.json`: organizer decisions and race assignments.
- `config/event.json`: public event status and prize announcement.
- `data/tournament-index.json`: generated event index.
- `data/tournament-statistics.json`: generated statistics; no awards.

The organizer engine still validates a configured four-round elimination bracket. Confirm the next format before creating its structure. Engine tests use a separate synthetic fixture; no test fixture is published.

## Exact outfit images

Team lineups, bracket cards and live-result entries use `assets/uma-race-art.js` and the pinned catalog. Exact card IDs or character/costume pairs select native 768×1024 transparent assets from the separate artwork repository. Unknown or mismatched variants show a neutral placeholder. Do not use thumbnails, screenshots, arbitrary base-outfit fallbacks or enlarged images.

## Validate and publish

```sh
python -m unittest discover -s tests -v
python scripts/tournament_engine.py build
node scripts/build_public_stats.cjs
node tests/test_season_ui.cjs
node tests/test_matchday.cjs
node tests/test_race_art.cjs
node tests/test_tournament_statistics.cjs
node tests/test_companion.cjs
node tests/test_companion_client.cjs
node tests/test_replay_client.js
python scripts/tournament_engine.py site
```

The Pages workflow runs checks before deployment. `PUBLISH_PAGES=true` enables deployment from `main`. Work in a focused branch and review its checks before merging.
