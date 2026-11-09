import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from tournament_engine import ARCHIVE, build


class EmptyStarterTests(unittest.TestCase):
    def test_no_previous_results_or_organizer_decisions(self):
        state = build(ROOT, write=False)
        index, control = state['index'], state['control']
        self.assertEqual(state['races'], {})
        self.assertIsNone(index['champion_id'])
        self.assertEqual(index['eliminated'], [])
        self.assertEqual(index['club_rosters'], {})
        self.assertEqual(control['revision'], 0)
        for key in ('decisions', 'race_overrides', 'roster', 'audit'):
            self.assertFalse(control[key], key)
        self.assertEqual(len(index['matches']), 10)
        for match in index['matches']:
            for key in ('winner_id', 'scores', 'draft', 'reported_results', 'races', 'lineup', 'player_points'):
                self.assertFalse(match[key], (match['id'], key))

    def test_historical_files_cannot_leak_into_public_build(self):
        source = ROOT / ARCHIVE
        self.assertEqual({p.name for p in source.iterdir()}, {'tournament.json', 'control.json'})
        self.assertEqual(list((ROOT / 'data/tournament-races').glob('*.json')), [])
        for name in ('bracket.json', 'drafts.json', 'index.json', 'match_scores.json', 'standings.json'):
            self.assertFalse((ROOT / 'data' / name).exists(), name)
        self.assertFalse((ROOT / 'legacy').exists())
        self.assertFalse((ROOT / 'docs/history').exists())

    def test_awards_are_unrevealed_without_historical_rulings(self):
        config = json.loads((ROOT / 'config/awards.json').read_text())
        self.assertFalse(config['reveal'])
        self.assertFalse(config['disqualifications'])
        self.assertFalse(config['mvp_champion_tiebreak']['enabled'])
