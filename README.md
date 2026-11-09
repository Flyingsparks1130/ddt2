# Dominator Tournament Companion Starter

[Live website](https://flyingsparks1130.github.io/dominatornetworktourney2026-companion-starter/) · [Companion results](https://flyingsparks1130.github.io/dominatornetworktourney2026-companion-starter/companion.html)

An independent copy of the original tournament website, prepared as a foundation for the next event. Previous tournament results, race exports, drafts, player lineups, organizer decisions and award standings have been removed. The copied club/bracket structure, rules and artwork remain templates; the next event's format is not finalized.

GitHub Actions tests and publishes updates to `main`. Pages uses GitHub Actions and the repository variable `PUBLISH_PAGES=true`.

## Companion connection

`companion.html` reads operator-approved `dominator-tournament/v1` exports. No results feed or event binding is preloaded. Run `preview_companion.bat` for a local preview, or use **Preview an export** on the results page.

## Source files

- `Dominator Tournament/tournament.json`: copied club/bracket template.
- `Dominator Tournament/control.json`: empty organizer state.
- `data/tournament-index.json` and `data/tournament-statistics.json`: generated current-event data.
- `assets/` and root HTML: website layout, replay and results components.
- `config/companion.json`: approved-results connection settings.
- `tests/fixtures/`: isolated practice and synthetic test inputs, excluded from publication.

## Development

```sh
python -m unittest discover -s tests -v
python scripts/tournament_engine.py build
node scripts/build_public_stats.cjs
python scripts/tournament_engine.py site
```

[Publishing](docs/maintaining.md) · [Match data](docs/match-data.md) · [Companion connection](docs/companion-integration.md) · [Race analysis](docs/race-analysis.md)
