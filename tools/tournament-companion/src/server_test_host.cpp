#include "dominator.h"
#include <cstdio>
std::mutex stateMutex;RaceSnapshot raceState;Settings settings;std::wstring baseDir;
void logLine(const std::string& message){printf("%s\n",message.c_str());fflush(stdout);}
int wmain(int argc,wchar_t** argv){
    if(argc<2)return 1;baseDir=argv[1];unsigned short port=argc>2?static_cast<unsigned short>(_wtoi(argv[2])):27841;
    const bool fixture=argc>3&&wcscmp(argv[3],L"--race-fixture")==0;
    if(fixture){raceState.active=true;raceState.identity=42;raceState.time=3;raceState.course=1600;Runner r;r.id=7;r.gate=8;r.rank=1;r.card=100602;r.name="Oguri Cap";r.variant="Ashen Miracle";r.trainer="Trainer <test>";r.club="Club & Team";r.style=2;r.distance=70;r.speed=20;r.rushed=true;r.blocked=true;r.lateStart=true;r.paceDown=true;r.paceMode=4;raceState.runners.push_back(r);}
    if(fixture){auto& r=raceState.runners[0];r.hpKnown=true;r.hp=0;r.staminaEmpty=true;raceState.trackName="Nakayama";raceState.trackId=10005;raceState.groundType=1;raceState.groundCondition=2;raceState.weather=2;raceState.season=4;}
    if(!startServer(port))return 2;puts("Test server ready");fflush(stdout);
    while(true){{std::lock_guard<std::mutex> lock(stateMutex);raceState.stamp=GetTickCount64();}Sleep(100);}
}
