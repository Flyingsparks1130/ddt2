from pathlib import Path
import copy
import json
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
import http.cookiejar

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from tournament_engine import ARCHIVE,TournamentError,build,normalize_race,mutate,import_race,read_json,time_display,save_draft
from tournament_draft import blank_draft
from tournament_admin import serve

def fixture(seed=100):
    horses=[]
    for i in range(10):
        owner=f'Player {i+1}'
        horses.append({'horseIndex':i,'postNumber':min(i+1,8),'charaName':'Same Character' if i in (0,1) else f'Uma {i+1}',
          'finishOrder':i,'finishTimeRaw':100+i*.2,'finishTimeScaled':125+i*.25,'trainerName':owner,'isGhost':True,
          'responseHorseData':{'trainer_name':'Host only','owner_trainer_name':owner,'frame_order':i+1,'card_id':100100+i,'running_style':1,'npc_type':11,'skill_array':[]},
          'raceParam':{'rawSpeed':1400,'rawStamina':900,'rawPow':1000,'rawGuts':600,'rawWiz':900},'trainedCharaData':{}})
    return {'horseACT_version':'1.1.7','numRaceHorses':10,'raceHorse':horses,'playerTeamMemberArray':horses[:3],
     'playerTeamTopFinishOrderHorse':horses[0],'randomSeed':seed,'raceCourseSet':{'distance':2200,'ground':1,'id':10308,'raceTrackId':10003},
     'rotationCategory':'Left','groundCondition':'Good','weather':'Sunny','season':'Summer'}

class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        (self.root/ARCHIVE).mkdir()
        shutil.copy2(ROOT/'tests/fixtures/engine-tournament.json',self.root/ARCHIVE/'tournament.json')
        # Each test starts with clean organizer state, irrespective of any local demo activity.
        p=self.root/ARCHIVE/'control.json';p.write_text(json.dumps({'schema_version':1,'revision':0,'decisions':{},'race_overrides':{},'roster':{},'audit':[]}))
        for rd in (self.root/ARCHIVE).glob('R*'):
            for f in rd.rglob('*.json'):
                if f.name!='match.json':f.unlink()
    def tearDown(self):self.tmp.cleanup()
    def command(self,action,mid='r1-m1',**extra):
        rev=read_json(self.root/ARCHIVE/'control.json')['revision']
        return mutate(self.root,{'action':action,'match_id':mid,'revision':rev,'reason':'Test organizer ruling',**extra})
    def upload(self,raw=None,**extra):
        rev=read_json(self.root/ARCHIVE/'control.json')['revision']
        data={'revision':rev,'match_id':'r1-m1','file_name':'test.json','race_folder':'01 - 2200m Turf','race_json':raw or fixture()};data.update(extra)
        return import_race(self.root,data)
    def test_zero_based_and_no_subset_duplicates(self):
        r=normalize_race(fixture());self.assertEqual(len(r['results']),10);self.assertEqual([x['place'] for x in r['results']],list(range(1,11)))
        self.assertEqual(sum(x['uma']=='Same Character' for x in r['results']),2)
    def test_owner_not_capture_trainer(self):
        r=normalize_race(fixture());self.assertEqual(r['results'][0]['owner'],'Player 1');self.assertEqual(r['results'][0]['capture_trainer'],'Host only')
    def test_raw_scaled_and_gate_distinction(self):
        r=normalize_race(fixture());self.assertEqual(r['results'][0]['raw_seconds'],100);self.assertEqual(r['results'][0]['scaled_seconds'],125)
        self.assertEqual(r['results'][9]['gate'],10);self.assertEqual(r['results'][9]['post_number'],8)
        self.assertEqual(time_display(59.9999),'1:00.000')
    def test_duplicate_place_rejected(self):
        f=fixture();f['raceHorse'][1]['finishOrder']=0
        with self.assertRaises(TournamentError):normalize_race(f)
    def test_incomplete_data_rejected(self):
        f=fixture();f['raceHorse'].pop()
        with self.assertRaises(TournamentError):normalize_race(f)
    def test_shape_from_user_image(self):
        r=build(self.root,write=False)['index'];self.assertEqual(len(r['teams']),11)
        self.assertEqual([sum(m['round']==f'R{i}' for m in r['matches']) for i in range(1,5)],[3,4,2,1])
        self.assertEqual(sum('team' in s for m in r['matches'] if m['round']=='R2' for s in m['sources']),5)
        self.assertFalse(r['eliminated']);self.assertIsNone(r['champion_id'])
    def test_unmapped_not_official_scores_or_npc(self):
        r=self.upload();race=next(iter(r['races'].values()));self.assertFalse(race['scoring_verified'])
        self.assertTrue(all(x['eligible'] for x in race['results']))
        self.assertIsNone(next(m for m in r['index']['matches'] if m['id']=='r1-m1')['scores'])
    def test_mapping_and_npc_points_roll_down(self):
        r=self.upload();rid=next(iter(r['races']));a={str(i):{'team_id':'test-club-i' if i<5 else 'test-club-h','eligible':i!=0} for i in range(10)}
        r=self.command('mapping',race_id=rid,assignments=a,remember_owners=True);race=r['races'][rid]
        self.assertTrue(race['scoring_verified']);self.assertEqual([x['points'] for x in race['results'][:5]],[0,4,2,1,0])
    def test_reject_more_than_five_per_team(self):
        r=self.upload();rid=next(iter(r['races']));a={str(i):{'team_id':'test-club-i','eligible':True} for i in range(10)}
        r=self.command('mapping',race_id=rid,assignments=a)
        self.assertFalse(r['races'][rid]['scoring_verified'])
    def test_manual_score_survives_rebuild(self):
        self.command('score',scores={'test-club-i':25,'test-club-h':18})
        self.assertEqual(build(self.root)['index']['matches'][0]['scores'],{'test-club-i':25,'test-club-h':18})
        self.assertIsNone(build(self.root)['index']['matches'][0]['winner_id'])
    def test_advance_eliminate_and_fill_next(self):
        self.command('score',scores={'test-club-i':25,'test-club-h':10})
        r=self.command('advance',winner_id='test-club-i')['index'];m=next(m for m in r['matches'] if m['id']=='r2-m1')
        self.assertEqual([p['id'] for p in m['participants']],['test-club-a','test-club-i']);self.assertIn('test-club-h',r['eliminated'])
        finished=next(m for m in r['matches'] if m['id']=='r1-m1')
        self.assertEqual(finished['status'],'complete');self.assertTrue(finished['score_only']);self.assertEqual(finished['races'],[])
        self.assertEqual(finished['scores'],{'test-club-i':25,'test-club-h':10})
    def test_full_progression(self):
        choices={'r1-m1':'test-club-i','r1-m2':'test-club-f','r1-m3':'test-club-g','r2-m1':'test-club-a','r2-m2':'test-club-e','r2-m3':'test-club-c','r2-m4':'test-club-b','r3-m1':'test-club-a','r3-m2':'test-club-b','r4-m1':'test-club-a'}
        for mid,w in choices.items():r=self.command('advance',mid,winner_id=w)
        self.assertEqual(r['index']['champion_id'],'test-club-a');self.assertEqual(len(r['index']['eliminated']),10)
    def test_downstream_change_guard(self):
        self.command('advance',winner_id='test-club-i');self.command('score','r2-m1',scores={'test-club-a':1,'test-club-i':2})
        with self.assertRaises(TournamentError):self.command('advance',winner_id='test-club-h')
    def test_forfeit_and_reopen(self):
        self.command('forfeit',winner_id='test-club-i');r=self.command('reopen')['index'];self.assertFalse(r['eliminated'])
    def test_stale_revision(self):
        self.command('score',scores={'test-club-i':1,'test-club-h':2})
        with self.assertRaises(TournamentError):mutate(self.root,{'action':'score','revision':0,'reason':'Old page','match_id':'r1-m1','scores':{'test-club-i':3,'test-club-h':4}})
    def test_original_bytes_preserved(self):
        f=fixture();text=json.dumps(f,indent=3)+'\n';self.upload(f,raw_text=text)
        target=self.root/ARCHIVE/'R1/Test Club I vs Test Club H/01 - 2200m Turf/test.json'
        self.assertEqual(target.read_bytes(),text.encode())
    def test_duplicate_content_rejected(self):
        self.upload()
        with self.assertRaises(TournamentError):self.upload(file_name='different-name.json')
    def test_traversal_rejected(self):
        for part in ('../escape','a/b','a\\b','CON','a:bad'):
            with self.assertRaises(TournamentError):self.upload(race_folder=part)
    def test_manual_folder_discovery(self):
        p=self.root/ARCHIVE/'Round 1'/'Test Club K vs Test Club F'/'01 - Race & course';p.mkdir(parents=True)
        (p/'raw export.json').write_text(json.dumps(fixture()))
        r=build(self.root);self.assertEqual(next(iter(r['races'].values()))['match_id'],'r1-m2')
    def test_no_advancement_before_participants(self):
        with self.assertRaises(TournamentError):self.command('advance','r4-m1',winner_id='test-club-a')
    def draft(self,mid='r1-m1',**fields):
        raw=blank_draft(mid);raw.update(fields)
        rev=read_json(self.root/ARCHIVE/'control.json')['revision']
        return save_draft(self.root,{'revision':rev,'match_id':mid,'reason':'Record match draft','draft_json':raw})
    def test_drafts_are_isolated_from_other_matches_and_races(self):
        r=self.draft(track_pool=['R1 pool'],track_picks=[{'team_id':'test-club-i','track':'2200m Turf'}])
        r=self.draft('r2-m2',track_pool=['R2 pool'],final_tracks=['1600m Turf'])
        by_id={m['id']:m for m in r['index']['matches']}
        self.assertEqual(by_id['r1-m1']['draft']['track_pool'],['R1 pool'])
        self.assertEqual(by_id['r2-m2']['draft']['track_pool'],['R2 pool'])
        self.assertEqual(r['races'],{});self.assertFalse(any(m['scores'] or m['winner_id'] for m in by_id.values()))
        folder=self.root/ARCHIVE/'R1/Test Club I vs Test Club H';folder.rename(folder.with_name('Renamed match'))
        self.assertEqual(build(self.root)['index']['matches'][0]['draft']['track_pool'],['R1 pool'])
    def test_final_selections_do_not_invent_players_benches_or_results(self):
        selections=[{'team_id':'test-club-i','uma':f'Uma {i}'} for i in range(6)]
        r=self.draft(status='locked',uma_selections=selections)
        m=next(m for m in r['index']['matches'] if m['id']=='r1-m1')
        self.assertEqual(m['draft_uma_actions']['uma_selections'],selections)
        self.assertEqual(m['draft_lineup'],[])
        self.assertEqual(m['draft']['benched_umas'],[])
        self.assertFalse(m['scores'] or m['winner_id'] or m['races'])
        with self.assertRaises(TournamentError):
            self.draft(uma_selections=[{'team_id':'test-club-a','uma':'Wrong club'}])
    def test_wrong_draft_match_and_club_rejected_without_overwrite(self):
        self.draft(track_pool=['Keep this pool'])
        path=self.root/ARCHIVE/'R1/Test Club I vs Test Club H/draft.json';before=path.read_bytes()
        for raw in [blank_draft('r2-m2'),dict(blank_draft('r1-m1'),track_picks=[{'team_id':'test-club-a','track':'Wrong club'}])]:
            with self.assertRaises(TournamentError):
                save_draft(self.root,{'revision':1,'match_id':'r1-m1','reason':'Invalid draft','draft_json':raw})
        self.assertEqual(path.read_bytes(),before)
        with self.assertRaises(TournamentError):
            save_draft(self.root,{'revision':0,'match_id':'r1-m1','reason':'Stale edit','draft_json':blank_draft('r1-m1')})
    def test_r2_json_scores_and_historical_draft_coexist(self):
        r=self.upload(match_id='r2-m2');rid=next(iter(r['races']))
        self.command('score','r2-m2',scores={'test-club-e':25,'test-club-d':10})
        self.command('advance','r2-m2',winner_id='test-club-e')
        r=self.draft('r2-m2',status='locked',final_tracks=['Race '+str(i) for i in range(1,6)])
        m=next(m for m in r['index']['matches'] if m['id']=='r2-m2')
        self.assertEqual(m['scores'],{'test-club-e':25,'test-club-d':10});self.assertEqual(m['winner_id'],'test-club-e')
        self.assertFalse(m['score_only']);self.assertEqual(m['races'][0]['id'],rid);self.assertEqual(len(m['draft']['final_tracks']),5)
    def test_downstream_populated_draft_blocks_earlier_winner_change(self):
        self.command('advance',winner_id='test-club-i')
        self.draft('r2-m1',track_picks=[{'team_id':'test-club-i','track':'2200m Turf'}])
        with self.assertRaises(TournamentError):self.command('reopen')
        self.assertEqual(build(self.root)['index']['matches'][0]['winner_id'],'test-club-i')
    def test_downstream_empty_template_does_not_block_winner_change(self):
        self.command('advance',winner_id='test-club-i');self.draft('r2-m1')
        r=self.command('advance',winner_id='test-club-h')
        self.assertEqual(next(m for m in r['index']['matches'] if m['id']=='r2-m1')['participants'][1]['id'],'test-club-h')
    def install_report(self):
        folder=self.root/ARCHIVE/'R1'/'Example match'
        folder.mkdir(parents=True,exist_ok=True)
        (folder/'match.json').write_text(json.dumps({'match_id':'r1-m1'}))
        podium=[{'team_id':'test-club-i' if i < 2 else 'test-club-h','uma':f'Uma {i+1}','discord':f'@Player{i+1}'} for i in range(3)]
        raw={'schema_version':1,'match_id':'r1-m1','external_match_id':None,'source':'Synthetic test report','mvp':podium[0],
             'races':[{'number':1,'track':'Test 2200m Turf','tiebreaker':False,'podium':podium}]}
        (folder/'results.json').write_text(json.dumps(raw))
        return folder,raw
    def test_report_does_not_infer_official_winner(self):
        self.install_report()
        state=build(self.root);match=state['index']['matches'][0]
        self.assertEqual(match['reported_results']['totals'],{'test-club-i':6,'test-club-h':1})
        self.assertIsNone(match['winner_id']);self.assertIsNone(match['scores'])
        self.assertEqual(state['races'],{})
    def test_report_rejects_duplicate_podium(self):
        folder,raw=self.install_report()
        raw['races'][0]['podium'][1]=raw['races'][0]['podium'][0]
        (folder/'results.json').write_text(json.dumps(raw))
        with self.assertRaises(TournamentError):build(self.root)
    def test_report_and_export_scores_are_not_added(self):
        self.install_report();state=self.upload();rid=next(iter(state['races']))
        state=self.command('mapping',race_id=rid,assignments={str(i):{'team_id':'test-club-i' if i<5 else 'test-club-h','eligible':True} for i in range(10)})
        match=state['index']['matches'][0]
        self.assertEqual(match['scores'],{'test-club-i':7,'test-club-h':0})
        self.assertEqual(match['reported_results']['totals'],{'test-club-i':6,'test-club-h':1})
        self.assertEqual(sum(p['points'] for p in match['player_points']),7)
    def test_http_csrf_host_and_write(self):
        s=serve(self.root,0);thread=threading.Thread(target=s.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{s.server_port}'
        opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        try:
            session=json.load(opener.open(base+'/api/session'))
            data={'revision':0,'action':'score','match_id':'r1-m1','reason':'Verified scores','scores':{'test-club-i':10,'test-club-h':4}}
            req=urllib.request.Request(base+'/api/control',data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':base})
            with self.assertRaises(urllib.error.HTTPError) as fail:opener.open(req)
            self.assertEqual(fail.exception.code,403)
            req.add_header('X-CSRF-Token',session['csrf']);result=json.load(opener.open(req));self.assertEqual(result['index']['revision'],1)
            draft=dict(blank_draft('r1-m1'),track_pool=['Local draft pool'])
            body={'revision':1,'match_id':'r1-m1','reason':'Record local draft','draft_json':draft}
            req=urllib.request.Request(base+'/api/draft',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':base})
            with self.assertRaises(urllib.error.HTTPError) as fail:opener.open(req)
            self.assertEqual(fail.exception.code,403)
            req.add_header('X-CSRF-Token',session['csrf']);result=json.load(opener.open(req))
            self.assertEqual(result['index']['matches'][0]['draft']['track_pool'],['Local draft pool'])
            req=urllib.request.Request(base+'/api/session',headers={'Host':'evil.example'})
            with self.assertRaises(urllib.error.HTTPError) as fail:opener.open(req)
            self.assertEqual(fail.exception.code,403)
        finally:s.shutdown();s.server_close();thread.join()

if __name__=='__main__':unittest.main()
