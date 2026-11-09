# DDT2 · Who Will Dominate?

[Live website](https://flyingsparks1130.github.io/ddt2/) · [Companion results](https://flyingsparks1130.github.io/ddt2/companion.html)

The second chapter of the Dominator Draft Tournament, built on the original DDT 2026 site. A crimson, black and gold interface features Gentildonna in her official race outfit, a shared tournament shell and short animated Uma transitions. Previous tournament results, race exports, drafts, player lineups, organizer decisions and award standings have been removed. The copied club/bracket structure, rules and artwork remain templates; the next event's format is not finalized.

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

## Design and motion

`assets/ddt2.css` owns the DDT2 visual system; `ddt2-brand.js` shares navigation and the footer, and `ddt2-motion.js` provides progressive navigation transitions. Normal document navigation, modifier clicks, downloads and deep links remain intact. Device reduced-motion preferences and the **Motion** button disable animation.

[Artwork sources and credits](docs/artwork-credits.md).
