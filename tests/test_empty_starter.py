import json
import copy
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from tournament_engine import ARCHIVE, TournamentError, build, load_setup


class UpcomingEventTests(unittest.TestCase):
    def test_no_previous_results_or_organizer_decisions(self):
        state = build(ROOT, write=False)
        index, control = state['index'], state['control']
        self.assertEqual(state['races'], {})
        self.assertIsNone(index['champion_id'])
        self.assertEqual(index['eliminated'], [])
        self.assertEqual(index['club_rosters'], index['team_rosters'])
        self.assertEqual([team['name'] for team in index['teams']],
                         ['Dominator', 'Dominare', 'Domineer', 'Dominium', 'DomiMoon'])
        self.assertEqual(len(index['team_rosters']), 5)
        for team in index['teams']:
            roster = index['team_rosters'][team['id']]
            self.assertEqual(roster['source'], 'registration')
            self.assertEqual(len(roster['members']), 5)
            self.assertEqual(roster['members'], team['members'])
            self.assertNotIn('match_id', roster)
            self.assertNotIn('round', roster)
            for player in roster['members']:
                self.assertEqual(set(player), {'display_name'})
        self.assertEqual(control['revision'], 0)
        for key in ('decisions', 'race_overrides', 'roster', 'audit'):
            self.assertFalse(control[key], key)
        self.assertEqual(index['matches'], [])
        self.assertEqual(index['rounds'], [])
        self.assertFalse(index['published'])
        self.assertEqual(index['prize']['count'], 6)
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
        self.assertEqual(config['images'], {})


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / ARCHIVE).mkdir()
        self.config = json.loads((ROOT / ARCHIVE / 'tournament.json').read_text(encoding='utf-8'))
        self.config['teams'] = [{'id': 'a', 'name': 'Team A', 'members': [{'display_name': 'Player A'}]}]
        self.control = {'revision': 0, 'decisions': {}, 'race_overrides': {}, 'roster': {}, 'audit': []}

    def save(self):
        (self.root / ARCHIVE / 'tournament.json').write_text(json.dumps(self.config), encoding='utf-8')
        (self.root / ARCHIVE / 'control.json').write_text(json.dumps(self.control), encoding='utf-8')

    def test_registration_and_empty_season_do_not_create_brackets(self):
        for teams in (self.config['teams'], []):
            with self.subTest(teams=teams):
                self.config['teams'] = teams
                self.save()
                index = build(self.root, write=False)['index']
                self.assertEqual(index['teams'], teams)
                self.assertEqual(index['rounds'], [])
                self.assertEqual(index['matches'], [])
                self.assertIsNone(index['champion_id'])

    def test_invalid_registration_rejected(self):
        invalid = [None, 'Player A', [{}], ['Player A'], [{'display_name': ''}],
                   [{'display_name': 7}], [{'display_name': '  '}],
                   [{'display_name': 'A'}, {'display_name': ' a '}],
                   [{'display_name': str(i)} for i in range(6)]]
        for members in invalid:
            with self.subTest(members=members):
                self.config['teams'][0]['members'] = members
                self.save()
                with self.assertRaises(TournamentError):
                    load_setup(self.root)

    def test_registration_cannot_publish_or_record_results_without_a_bracket(self):
        self.config['published'] = True
        self.save()
        with self.assertRaisesRegex(TournamentError, 'without a bracket'):
            load_setup(self.root)
        self.config['published'] = False
        for key in ('decisions', 'race_overrides', 'roster'):
            with self.subTest(key=key):
                self.control[key] = {'missing-match': {'winner_id': 'a'}}
                self.save()
                with self.assertRaisesRegex(TournamentError, 'without a bracket'):
                    load_setup(self.root)
                self.control[key] = {}

    def test_registration_does_not_bypass_bracket_validation(self):
        self.config['rounds'] = [{'id': 'R1', 'name': 'Unconfirmed'}]
        self.save()
        with self.assertRaisesRegex(TournamentError, 'four ordered rounds'):
            load_setup(self.root)

    def test_duplicate_team_ids_still_rejected(self):
        self.config['teams'].append(copy.deepcopy(self.config['teams'][0]))
        self.save()
        with self.assertRaisesRegex(TournamentError, 'IDs must be unique'):
            load_setup(self.root)
