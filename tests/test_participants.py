import copy
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from tournament_engine import build
from tournament_participants import attach_participants, display_name


class ParticipantTests(unittest.TestCase):
    def test_verified_owners_and_report_do_not_double_count(self):
        rows=[{'entry_id':str(i),'place':i+1,'owner':name,'team_id':team,'eligible':True,'variant_id':100+i,'uma':f'Uma {i}','points':points}
              for i,(name,team,points) in enumerate([('Player A','a',4),('Player B','b',2),('Player C','a',1)])]
        match={'id':'m','round':'R1','participants':[{'id':'a'},{'id':'b'}], 'draft':None,
               'races':[{'id':'r','scoring_verified':True}],
               'reported_results':{'races':[{'number':1,'podium':[{'team_id':'a','uma':'Uma 0','discord':'@Player A','points':4,'place':1}]}]}}
        clubs=attach_participants([match],{'r':{'race_folder':'01 - Test','results':rows}})
        self.assertEqual({r['display_name'] for r in match['lineup']},{'Player A','Player B','Player C'})
        self.assertEqual(sum(r['points'] for r in match['player_points']),7)
        self.assertEqual(clubs['b']['members'],[{'display_name':'Player B'}])

    def test_unverified_race_cannot_replace_draft_roster(self):
        match = {'id':'r1-m1','round':'R1','participants':[{'id':'a'},{'id':'b'}],
                 'draft':{'roster':[{'team_id':'a','uma':'Uma','discord':'@Known','benched':False}]},
                 'races':[{'id':'r','scoring_verified':False}]}
        source = copy.deepcopy(match['draft'])
        clubs = attach_participants([match], {})
        self.assertEqual(clubs['a']['members'][0]['display_name'], 'Known')
        self.assertEqual(match['draft'], source)

    def test_discord_mentions_are_not_invented_names(self):
        self.assertEqual(display_name('@Flareon'), 'Flareon')
        self.assertEqual(display_name('<@479998555290075136>'), '')
        self.assertEqual(display_name('<@!479998555290075136>'), '')
        self.assertEqual(display_name('name@club'), 'name@club')


if __name__ == '__main__':
    unittest.main()
