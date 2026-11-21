# DDT2 operator companion

Obtain the Windows package privately from the organizer. Public release downloads and CI package artifacts are withdrawn; source code remains public. The private package includes the independent Hachimi plugin, standalone launcher, Node runtime, OBS sources and operator guide. [Installation details](../tools/tournament-companion/README.txt) cover both existing plugin users and first installations. The installer does not change Hachimi or horseACT; first-time plugin registration is an explicit owner setup step. See the [operator handoff](private-operator-handoff.md) for current publishing limitations.

Each operator's PC has its own local event store. Use one authoritative results publisher. The GitHub site reads approved summaries; it does not synchronize multiple operator desks or send live game telemetry. Version 0.6.0 publishing requires `DOMINATOR_GITHUB_TOKEN` with repository write access and explicit publication approval. The proposed private operator-key publishing service is not implemented yet. No credentials or tournament results are included in the package.

The separate local desk at `http://127.0.0.1:27840/` imports the published DDT2 roster and resolved bracket matchups. The roster currently has 12 teams and 60 players. Until the bracket is published, operators can create local series; these are not automatically attached to a public bracket slot.

Each series has six drafted race slots and one reserved tiebreaker. Race points are 4 / 2 / 1. Reaching 25 stops further race approval, but never confirms a winner automatically. Operators approve race results, then separately confirm the series outcome. Actual in-game trainer aliases can be saved or runners mapped during review.

## Approval and corrections

Captures remain pending until reviewed after the broadcast finishes. Manual podiums and static score overrides require a reason and named operator approval. They are explicitly identified as manual; no raw horseACT export is fabricated. Static scores stay fixed until an approved return to calculated scores. A score or race change invalidates an earlier outcome confirmation.

Publishing is a separate explicit action after previewing the exact export and destination. The destination is `Flyingsparks1130/ddt2`, branch `main`, file `data/companion/approved-results.json`. The `dominator-tournament/v1` envelope is preserved, with an optional `ddt2-series/v1` extension. Recorded-race standings exclude manual podiums and static score overrides; the series extension carries the effective series totals. Tokens never belong in this repository or public browser JavaScript.

## Public reader

`companion.html` displays validated series totals and recorded-race standings. Main site pages project explicitly linked series into the corresponding match display only when both participants match. Existing organizer scores, podiums or conflicting winners are preserved and flagged for reconciliation. This does not rewrite `control.json`, create raw race exports, or silently advance downstream bracket decisions. Use the existing organizer engine to reconcile and advance official bracket decisions, then refresh the companion's published bracket.

Missing feeds are normal before first publication. Malformed or temporarily unavailable feeds retain the last verified in-memory display and show a notice. No example or test results are published by this integration.

## Broadcast sources

- `/overlay`: live race tracker, 440 × 1080. Use 880 × 2160 with `?renderScale=2` for higher-resolution rendering.
- `/matchup`: 1920 × 1080, team names, five players each, series points.
- `/scoreboard`: 1920 × 1080, series scores and race slots.

Add `?demo=1` for clearly labelled samples. Sample output cannot enter scoring. The desk also controls the independent DominatorNetwork in-game preview; F8 toggles it. Hachimi and horseACT are unchanged.

The current scene sizes and operator flow are documented in [Companion 0.6.1](companion-release-0.6.1.md).
The matching in-game race preview and DLL update instructions are in
[Companion 0.6.2](companion-release-0.6.2.md).
