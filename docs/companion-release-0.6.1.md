# Companion 0.6.1: scenes between races

The matchup and series scoreboard are full-screen 1920 × 1080 OBS Browser Sources. The race tracker retains its classic burgundy Gentildonna design with a tighter layout, separate identity and telemetry columns, and quieter top-three shading.

| Source | Content | Size |
| --- | --- | --- |
| `http://127.0.0.1:27840/overlay` | Live race standings | 440 × 1080 |
| `http://127.0.0.1:27840/matchup` | Two teams, five players and their exact Uma outfits per side | 1920 × 1080 |
| `http://127.0.0.1:27840/scoreboard` | Cumulative race 1–6/TB scores, total and previous approved podium | 1920 × 1080 |

Add `?demo=1` for sample previews. Remove it when broadcasting real data. Use the two full-screen sources in separate OBS scenes between races. Refresh the browser source after updating; change an old scoreboard source from 1600 × 262 to 1920 × 1080.

## Operator flow

The Race desk highlights the next step: choose a race, capture, review and approve, then publish separately. Match setup groups matchup creation, drafted tracks and per-race Uma choices. Teams & connection holds aliases and the capture/publishing settings. Broadcast scenes contains source URLs, sample/live previews and the existing optional native preview. Corrections and Activity remain separate.

Before capture, select each player's exact Uma/outfit under **Match setup → Choose the Umas**. Unknown selections remain explicitly unknown. Saving lineups never changes points, and an approved recorded result supplies its actual card ID in preference to a pre-race selection. Lineups are locked after approval. Stale form revisions are rejected.

The scoreboard includes approved recorded or approved manual races only. Each played race column shows the cumulative score after that race, with its individual point contribution underneath. Unplayed slots show a dash. An approved static score correction changes the total while retaining the recorded per-race progression and labels the override. The latest approved race supplies the three podium cards and the points earned in that race. Pending and voided results are excluded. No winner is inferred or automatically published.

## Artwork and compatibility

The 116-card catalog uses English in-game character and outfit names, joined by exact card ID. Full-body artwork comes from `Flyingsparks1130/uma-race-art`, pinned at commit `82f9fc0876103ac2378ded370065e5838cdff2c5`. The local exact-card portrait is the fallback if remote art cannot load. Unknown cards do not receive a guessed outfit.

This is a web/Node companion update. The independent native bridge remains 0.6.0; Hachimi and horseACT require no changes. The optional native preview is not a browser renderer and does not mirror these new intermission scenes.

Approval before publishing remains required. The private operator-key publishing relay is still not implemented. Source updates do not restore public binary downloads; Windows validation builds remain unpublished.

Automated coverage includes approval boundaries, cumulative scoring, overrides, exact-card precedence, lineup validation, HTTP persistence and the live-tracker fit/indicator model. Desktop visual review was stopped at the owner's request and is not claimed as completed.
