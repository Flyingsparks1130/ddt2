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

    def test_registered_players_are_not_replaced_by_match_owner_names(self):
        registered = [{'id': 'a', 'members': [{'display_name': 'Registered Player'}]}]
        original = copy.deepcopy(registered)
        match = {'id': 'm', 'round': 'R1', 'participants': [{'id': 'a'}, {'id': 'b'}],
                 'races': [], 'draft': {'roster': [
                     {'team_id': 'a', 'uma': 'Uma A', 'display_name': 'Match owner', 'benched': False},
                     {'team_id': 'b', 'uma': 'Uma B', 'display_name': 'Other owner', 'benched': False}]}}
        rosters = attach_participants([match], {}, registered_teams=registered)
        self.assertEqual(rosters['a'], {'source': 'registration', 'members': registered[0]['members']})
        self.assertEqual(rosters['b']['members'], [{'display_name': 'Other owner'}])
        self.assertEqual(match['lineup'][0]['display_name'], 'Match owner')
        rosters['a']['members'][0]['display_name'] = 'Changed copy'
        self.assertEqual(registered, original)

    def test_lineup_preserves_verified_build_supports_without_mutating_source(self):
        row = {'team_id':'a', 'eligible':True, 'owner':'Player', 'variant_id':111601,
               'uma':'Gentildonna', 'points':4, 'stats':{'speed':1234},
               'running_style':'Pace', 'support':[{'id':30028, 'limit_breaks':4}]}
        original = copy.deepcopy(row)
        match = {'id':'m', 'round':'R1', 'participants':[{'id':'a'}], 'draft':None,
                 'races':[{'id':'r', 'scoring_verified':True}]}
        attach_participants([match], {'r':{'results':[row], 'race_folder':'01 - Test'}})
        self.assertEqual(match['lineup'][0]['support'], row['support'])
        self.assertEqual(match['lineup'][0]['stats'], {'speed':1234})
        match['lineup'][0]['support'][0]['limit_breaks'] = 0
        self.assertEqual(row, original)


if __name__ == '__main__':
    unittest.main()
