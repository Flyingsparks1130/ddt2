# Match data

The public navigation follows tournament → round → matchup → race description → original export. Each matchup also has a **Match draft** tab.

## Folder contents

Example: `Dominator Tournament/R1/Dominion vs Dominarium/`

| File or folder | Purpose |
| --- | --- |
| `match.json` | Stable internal ID, e.g. `{"match_id":"r1-m1"}` |
| `draft.json` | This matchup's tracks, draft actions, final roster and bench |
| `results.json` | Optional organizer-reported podiums and MVP when raw exports are unavailable |
| `01 - track description/original.json` | Unmodified race export; folder numbering controls display order |

Use `R1` through `R4` for Round 1, quarterfinals, semifinals and final. `Round 1` through `Round 4` are also recognized. A stable match marker allows display-folder renames. Distinct exports count as distinct races; duplicate content is rejected. Keep practice files outside the active archive.

## Drafts

`draft.json` uses schema version 1 and the internal `match_id`. All other fields can be omitted until known. Unknown fields or another matchup's club are rejected.

| Field | Value |
| --- | --- |
| `external_match_id` | Source identifier such as `EXAMPLE`; distinct from `r1-m1` |
| `status` | `pending`, `in_progress`, or `locked`; independent of official result status |
| `track_pool`, `final_tracks` | Arrays of full track-description strings; final-track order is race order |
| `tiebreaker_track` | Track string or `null` |
| `track_picks`, `track_vetoes` | Arrays of `{"team_id":"dominion","track":"Track description"}` |
| `uma_pre_bans`, `uma_picks`, `uma_bans`, `uma_additions`, `benched_umas` | Arrays of `{"team_id":"dominion","uma":"Character and variant"}` |
| `roster` | Arrays of `{"team_id":"dominion","uma":"Gold Ship","discord":"@Player","benched":false}` |
| `training_start`, `training_deadline` | Optional date/time strings with timezone |
| `notes` | Optional context and gaps in the available record |

For actions, `team_id` is the club making the pick or veto. For a bench or roster entry, it is the owning club. Preserve known snake-pick order across both teams. A bench may use `discord:null`. Do not reconstruct unsupplied pick phases from the final roster. Only one draft belongs to each match.

Roster entries may include `display_name` to resolve a supplied Discord ID or record an export-backed player name. An active entry may use `discord:null` only with a non-empty `display_name`; an in-game owner name is not assumed to be a Discord handle. Club rosters expose only player names. Uma selections and portraits remain specific to each matchup.

## Reported results

`results.json` contains `schema_version`, `match_id`, `external_match_id`, `source`, `mvp`, and `races`. Each race has `number`, `track`, `tiebreaker`, and a three-runner `podium` in finishing order. Each runner and MVP has `team_id`, `uma`, and `discord`; MVP may be `null`.

The engine validates active roster membership and variants, applies 4/2/1 to reported podiums, and generates race scores and cumulative totals. A report does not become an original race export and does not automatically confirm the winner. Report totals and raw-export totals remain separate. Official adjustments remain available through organizer controls.

Reported runners and MVP may also include `display_name`, with the same rule for an unknown Discord identity. Use `external_match_id:null` when no external ID was supplied. Player contributions include zero-point players and combine verified race points with reported podiums only for races that have no verified export.
