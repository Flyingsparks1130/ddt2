const {execFileSync}=require('node:child_process');
module.exports=JSON.parse(execFileSync(process.env.PYTHON || 'python',['-c',
 "import sys,json;from pathlib import Path;sys.path.insert(0,'scripts');from tournament_engine import normalize_race;print(json.dumps(normalize_race(json.loads(Path('tests/fixtures/replay-kyoto.json').read_text()))))"],{encoding:'utf8',maxBuffer:32*1024*1024}));
