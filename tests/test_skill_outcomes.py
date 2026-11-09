import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from tournament_skills import DotNetRandom, attach_skill_outcomes


class SkillOutcomeTests(unittest.TestCase):
    def setUp(self):
        # Synthetic one-runner stream: three lotteries followed by a known
        # .NET seed-1 start delay. It contains no tournament telemetry.
        self.raw = {'randomSeed':1, 'raceHorse':[{'responseHorseData':{
            'frame_order':1, 'card_id':100101, 'wiz':100, 'motivation':3,
            'skill_array':[{'skill_id':200001}, {'skill_id':200002}, {'skill_id':200003}]}}]}
        self.replay = {'runners':[{'frame_index':0, 'start_delay_ms':77.16041058301926}],
                       'events':[{'type':3, 'params':[0,200003]}]}
        self.definitions = {str(i):{'activate_lot':1} for i in (200001,200002,200003)}

    def test_dotnet_seed_reference_sequence(self):
        rng = DotNetRandom(1)
        for expected in [0.24866858415709278, 0.11074397718102856, 0.46701067987224587]:
            self.assertAlmostEqual(rng.next(), expected, places=15)

    def test_activation_and_distinct_failure_reasons(self):
        with patch('tournament_skills.metadata', return_value=self.definitions):
            attach_skill_outcomes(self.raw, self.replay)
        self.assertTrue(self.replay['skill_lottery']['verified'])
        outcomes = self.replay['runners'][0]['skill_outcomes']
        self.assertEqual(outcomes['200001']['status'], 'failed_wit')
        self.assertEqual(outcomes['200002']['status'], 'failed_condition')
        self.assertEqual(outcomes['200003']['status'], 'activated')

    def test_unverified_stream_does_not_invent_failure_reasons(self):
        self.raw['randomSeed'] = 2
        with patch('tournament_skills.metadata', return_value=self.definitions):
            attach_skill_outcomes(self.raw, self.replay)
        self.assertFalse(self.replay['skill_lottery']['verified'])
        statuses = {v['status'] for v in self.replay['runners'][0]['skill_outcomes'].values()}
        self.assertEqual(statuses, {'activated','unresolved'})

    def test_racing_spirit_self_hp_cost_is_not_an_opponent_debuff(self):
        meta = json.loads((ROOT/'assets/skill-metadata.json').read_text())
        for skill_id in ('210091', '210101', '210111', '210121', '210131', '210141'):
            self.assertEqual(meta[skill_id]['category'], 'regular')
        self.assertEqual(meta['210101']['icon_id'], 20011)
