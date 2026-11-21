#pragma once
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <array>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>
struct Runner {
    int id=0,rank=0,gate=0,style=0,chara=0,card=0;
    float distance=0,speed=0,hp=0,maxHp=0;
    bool hpKnown=false,staminaEmpty=false;
    bool finished=false,player=false;
    bool rushed=false,blocked=false,lateStart=false,paceUp=false,paceDown=false;
    int paceMode=-1;
    std::string name,variant,trainer,creator,club;
};
inline std::string fullUmaName(const Runner& r){return r.variant.empty()?r.name:r.name+" ("+r.variant+")";}
struct RaceSnapshot {
    std::vector<Runner> runners;
    float time=0,course=0;
    int trackId=0,groundType=0,groundCondition=0,weather=0,season=0;
    std::string trackName;
    bool paused=false,active=false,demo=false;
    unsigned long long stamp=0;
    uintptr_t identity=0;
};
struct TeamLabel {char trainer[192]{};char team[192]{};};
struct Settings {int picks[3]={-1,-1,-1};std::array<TeamLabel,64> teams{};};
inline std::string teamLabelFor(const Runner& r,const Settings& cfg){for(auto& label:cfg.teams)if(!r.trainer.empty()&&r.trainer==label.trainer&&label.team[0])return label.team;return r.club.empty()?"TEAM TBD":r.club;}
extern std::mutex stateMutex;
extern RaceSnapshot raceState;
extern Settings settings;
extern std::wstring baseDir;
void logLine(const std::string& message);
using GetApi=void*(*)(const char*);
bool initTelemetry(GetApi api);
void scheduleTelemetry();
bool startServer(unsigned short port=27840);
void stopServer();
bool registerGamePreview(GetApi api);
void drawGamePreview(void* swapchain);
