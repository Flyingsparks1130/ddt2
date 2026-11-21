#include "dominator.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstring>
#include <unordered_map>
#include <type_traits>
#include <limits>

namespace {
void* (*image)(const char*);
void* (*klass)(void*,const char*,const char*);
void* (*method)(void*,const char*,int);
void* (*field)(void*,const char*);
void (*fieldValue)(void*,void*,void*);
void* (*singleton)(void*);
void* (*runtimeInvoke)(void*,void*,void**,void**);
void* (*unbox)(void*);
void* (*objectClass)(void*);
void* (*parentClass)(void*);
void* (*classFields)(void*,void**);
const char* (*fieldName)(void*);
void* (*fieldType)(void*);
int (*typeType)(void*);
void* (*methodReturnType)(void*);
void* (*classFromType)(void*);
bool (*classIsEnum)(void*);
void* (*enumBaseType)(void*);
void* (*classProperties)(void*,void**);
const char* (*propertyName)(void*);
void* (*propertyGetter)(void*);
unsigned short* (*stringChars)(void*);
int (*stringLength)(void*);
size_t (*arrayLength)(void*);
unsigned int (*arrayHeader)();
void* (*mainThread)();
void (*schedule)(void*,void(*)());
std::atomic<bool> pending=false;
void* raceManagerClass=nullptr;
void* masterManagerClass=nullptr;
std::unordered_map<int,std::string> cardTitles;
bool resolved=false;
std::atomic<bool> failed=false;
unsigned long long lastRequest=0;
struct Member{void* getter=nullptr;void* field=nullptr;int type=0;};
std::unordered_map<void*,std::unordered_map<std::string,Member>> members;
std::unordered_map<void*,std::unordered_map<std::string,void*>> methods;
int scalarType(void* type){if(!type)return 0;int t=typeType(type);if(t==0x11){auto c=classFromType(type);return c&&classIsEnum(c)?typeType(enumBaseType(c)):0;}return t;}
std::string norm(const char* p){std::string s;for(;p&&*p;p++){if(*p=='>')break;if(std::isalnum(static_cast<unsigned char>(*p)))s+=char(std::tolower(static_cast<unsigned char>(*p)));}return s;}
void* findMethod(void* k,const char* name){if(!k)return nullptr;auto& cache=methods[k];auto it=cache.find(name);if(it!=cache.end())return it->second;void* found=method(k,name,0);cache[name]=found;return found;}
Member findMember(void* k,const char* name){
    auto& cache=members[k];auto key=norm(name);auto it=cache.find(key);if(it!=cache.end())return it->second;
    Member result;
    for(auto c=k;c;c=parentClass?parentClass(c):nullptr){
        if(classProperties && propertyName && propertyGetter){void* iter=nullptr;while(auto p=classProperties(c,&iter)){if(norm(propertyName(p))==key){result.getter=propertyGetter(p);if(result.getter)result.type=scalarType(methodReturnType(result.getter));break;}}}
        if(result.getter)break;
        if(classFields && fieldName){void* iter=nullptr;while(auto f=classFields(c,&iter)){if(norm(fieldName(f))==key){result.field=f;result.type=scalarType(fieldType(f));break;}}}
        if(result.field)break;
    }
    cache[key]=result;return result;
}
void* invoke(void* m,void* object){if(!m)return nullptr;void* exc=nullptr;void* result=runtimeInvoke(m,object,nullptr,&exc);return exc?nullptr:result;}
void* invokeObject(void* object,const char* name){return object?invoke(findMethod(objectClass(object),name),object):nullptr;}
float readFloatMethod(void* object,const char* name){
    float missing=std::numeric_limits<float>::quiet_NaN();if(!object)return missing;
    auto m=findMethod(objectClass(object),name);if(!m||scalarType(methodReturnType(m))!=0xc)return missing;
    auto result=invoke(m,object);auto value=result?unbox(result):nullptr;return value?*static_cast<float*>(value):missing;
}
template<class T>T number(void* object,const char* name,T fallback={}){
    if(!object)return fallback;auto m=findMember(objectClass(object),name);
    if constexpr(std::is_same_v<T,float>){if(m.type!=0xc)return fallback;}
    else if constexpr(std::is_same_v<T,int>){if(m.type!=0x4&&m.type!=0x5&&m.type!=0x8&&m.type!=0x9)return fallback;}
    else if constexpr(std::is_same_v<T,bool>){if(m.type!=0x2)return fallback;}
    unsigned char bytes[sizeof(T)]{};
    size_t size=(m.type==0x4||m.type==0x5)?1:sizeof(T);
    if(m.getter){auto v=invoke(m.getter,object);if(!v)return fallback;auto data=unbox(v);if(!data)return fallback;memcpy(bytes,data,size);}
    else if(m.field){fieldValue(object,m.field,bytes);}
    else return fallback;
    if constexpr(std::is_same_v<T,int>){if(m.type==0x4)return static_cast<signed char>(bytes[0]);if(m.type==0x5)return bytes[0];}
    T out;memcpy(&out,bytes,sizeof(T));return out;
}
void* currentFrame(void* reader,int index){
    if(!reader)return nullptr;
    auto get=method(objectClass(reader),"GetFrameDataFromCache",1);if(!get)return nullptr;
    void* args[]={&index};void* error=nullptr;
    auto frame=runtimeInvoke(get,reader,args,&error);return error?nullptr:frame;
}
void* objectMember(void* object,const char* name){
    if(!object)return nullptr;auto m=findMember(objectClass(object),name);
    if(m.getter)return invoke(m.getter,object);
    if(m.field && (m.type==0x12||m.type==0x15||m.type==0x1c||m.type==0xe||m.type==0x1d||m.type==0x14)){void* v=nullptr;fieldValue(object,m.field,&v);return v;}
    return nullptr;
}
std::string stringValue(void* s){if(!s)return {};int n=stringLength(s);if(n<=0||n>256)return {};auto chars=stringChars(s);if(!chars)return {};int bytes=WideCharToMultiByte(CP_UTF8,0,reinterpret_cast<wchar_t*>(chars),n,nullptr,0,nullptr,nullptr);if(bytes<=0)return {};std::string out(bytes,0);WideCharToMultiByte(CP_UTF8,0,reinterpret_cast<wchar_t*>(chars),n,out.data(),bytes,nullptr,nullptr);return out;}
std::string stringMember(void* object,const char* name){
    if(!object)return {};auto m=findMember(objectClass(object),name);
    // Only pass confirmed System.String members to the IL2CPP string API.
    if(m.type!=0xe)return {};return stringValue(objectMember(object,name));
}
std::string clubName(void* object){
    for(auto key:{"circle_name","club_name"}){auto s=stringMember(object,key);if(!s.empty())return s;}
    return {};
}
std::string cardTitle(int card){
    if(card<=0||!masterManagerClass)return {};
    auto cached=cardTitles.find(card);if(cached!=cardTitles.end())return cached->second;
    auto master=objectMember(singleton(masterManagerClass),"masterCardData");if(!master)return {};
    auto get=method(objectClass(master),"Get",1);if(!get)return {};
    void* args[]={&card};void* error=nullptr;auto data=runtimeInvoke(get,master,args,&error);if(error||!data)return {};
    // This is MasterCardData.CardData, not the separate user-card CardData class.
    auto title=stringMember(data,"Titlename");
    if(title.size()>1&&title.front()=='['&&title.back()==']')title=title.substr(1,title.size()-2);
    if(!title.empty()){cardTitles[card]=title;logLine("Card "+std::to_string(card)+" in-game title: "+title);}
    return title;
}
bool resolveGame(){
    void* img=nullptr;for(auto name:{"umamusume","Assembly-CSharp","Gallop"}){img=image(name);if(img)break;}
    if(!img){logLine("Game assembly not ready; will retry.");return false;}
    raceManagerClass=klass(img,"Gallop","RaceManager");
    masterManagerClass=klass(img,"Gallop","MasterDataManager");
    if(!raceManagerClass){failed=true;logLine("Gallop.RaceManager unavailable. Overlay disabled for this game build.");return false;}
    resolved=true;logLine("Race telemetry ready on Unity main thread.");return true;
}
void poll(){
    struct Reset{~Reset(){pending=false;}}reset;
    if(failed)return;
    if(!resolved&&!resolveGame())return;
    RaceSnapshot snap;snap.stamp=GetTickCount64();
    void* manager=singleton(raceManagerClass);
    void* horses=objectMember(manager,"horseManager");
    void* array=invokeObject(horses,"GetHorseRaceInfos");
    if(array){
        size_t n=arrayLength(array),offset=arrayHeader();
        if(n>0&&n<=32&&offset>=24&&offset<=64){
            void* race=invoke(findMethod(raceManagerClass,"get_RaceInfo"),nullptr);
            snap.course=static_cast<float>(number<int>(race,"CourseDistance"));
            snap.trackId=number<int>(race,"RaceTrackId");snap.trackName=stringMember(objectMember(race,"RaceTrack"),"Name");
            snap.groundType=number<int>(race,"GroundType");snap.groundCondition=number<int>(race,"GroundCondition");
            snap.weather=number<int>(race,"Weather");snap.season=number<int>(race,"Season");
            snap.identity=reinterpret_cast<uintptr_t>(array);
            void* reader=objectMember(horses,"reader");
            snap.time=number<float>(reader,"curTime");
            if(!std::isfinite(snap.time)||snap.time<0)snap.time=0;
            auto pause=invokeObject(manager,"IsPaused");if(pause)snap.paused=*static_cast<bool*>(unbox(pause));
            auto player=invokeObject(horses,"GetPlayerHorseIndex");int playerIndex=player?*static_cast<int*>(unbox(player)):-1;
            auto entries=reinterpret_cast<void**>(static_cast<unsigned char*>(array)+offset);
            for(size_t i=0;i<n;i++){
                auto h=entries[i];if(!h)continue;Runner r;r.id=int(i);r.player=int(i)==playerIndex;
                auto data=objectMember(h,"HorseData");
                r.name=stringValue(objectMember(h,"CharaName"));if(r.name.empty())r.name=stringValue(objectMember(data,"charaName"));if(r.name.empty())r.name="Runner "+std::to_string(i+1);
                r.rank=number<int>(h,"CurOrder",-1);r.gate=number<int>(data,"GateNo",int(i)+1);
                r.distance=number<float>(h,"distance");r.speed=number<float>(h,"lastSpeed");
                r.hp=readFloatMethod(h,"GetHp");r.maxHp=readFloatMethod(h,"GetMaxHp");
                auto finish=invokeObject(h,"IsFinished");r.finished=finish?*static_cast<bool*>(unbox(finish)):false;
                // CurOrder keeps changing during the run-out. Reveal the official
                // placing only after this runner has crossed the finish line.
                if(r.finished){int order=number<int>(h,"FinishOrder",-1);if(order>=0&&order<int(n))r.rank=order;}
                r.chara=number<int>(data,"charaId");
                r.style=number<int>(data,"RunningStyle",0);
                auto response=objectMember(data,"responseHorseData");if(r.style<1||r.style>4)r.style=number<int>(response,"running_style",0);
                r.trainer=stringMember(data,"TrainerName");if(r.trainer.empty())r.trainer=stringMember(response,"trainer_name");
                r.creator=stringMember(response,"owner_trainer_name");
                if(r.trainer.empty())r.trainer=r.creator;
                r.club=clubName(data);if(r.club.empty())r.club=clubName(response);
                r.card=number<int>(data,"CardId",0);if(r.card<=0)r.card=number<int>(response,"card_id",0);
                r.variant=cardTitle(r.card);
                r.rushed=number<bool>(h,"IsTemptation");
                r.blocked=number<bool>(h,"IsClog");
                // Replay frames carry the current blocking horse and temptation
                // mode even when simulation-only getters remain at defaults.
                // Read the existing current-time cache; never seek future data.
                auto frame=currentFrame(objectMember(h,"simulateReader"),int(i));
                float frameHp=number<float>(frame,"Hp",std::numeric_limits<float>::quiet_NaN());
                if(std::isfinite(frameHp))r.hp=frameHp;
                r.hpKnown=std::isfinite(r.hp);
                r.staminaEmpty=r.hpKnown&&r.hp<=0&&snap.time>0&&snap.course>0&&std::isfinite(r.distance)&&r.distance>=0&&r.distance<snap.course&&!r.finished;
                if(!r.hpKnown)r.hp=0;
                if(!std::isfinite(r.maxHp))r.maxHp=0;
                int temptation=number<int>(frame,"TemptationMode",-1);
                int blocker=number<int>(frame,"BlockFrontHorseIndex",-2);
                if(temptation>=0&&temptation<=4)r.rushed=temptation>0;
                if(blocker>=-1&&blocker<int(n))r.blocked=blocker>=0&&blocker!=int(i);
                // Bad-start is a latched race flag; expose it only near the start.
                r.lateStart=number<bool>(h,"IsBadStart")&&snap.time>0&&snap.time<6;
                r.paceMode=number<int>(h,"PositionKeepMode",-1);
                // RaceDefine.PositionKeepMode: SpeedUp=1, Overtake=2, PaseUp=3,
                // PaseDown=4, PaseUpEx=5. These are states, not speed derivatives.
                r.paceUp=r.paceMode==1||r.paceMode==2||r.paceMode==3||r.paceMode==5;
                r.paceDown=r.paceMode==4;
                if(r.finished){r.rushed=r.blocked=r.lateStart=r.paceUp=r.paceDown=false;}
                if(r.style<1||r.style>4)r.style=number<int>(h,"RunningStyle",0);
                if(!std::isfinite(r.distance)||r.distance<0)r.distance=0;if(!std::isfinite(r.speed)||r.speed<0)r.speed=0;
                snap.runners.push_back(r);
            }
            snap.active=!snap.runners.empty();
            bool validRanks=std::all_of(snap.runners.begin(),snap.runners.end(),[n](const Runner& r){return r.rank>=0&&r.rank<int(n);});
            std::stable_sort(snap.runners.begin(),snap.runners.end(),[validRanks](const Runner& a,const Runner& b){if(a.finished!=b.finished)return a.finished;if(validRanks&&a.rank!=b.rank)return a.rank<b.rank;if(a.distance!=b.distance)return a.distance>b.distance;return a.id<b.id;});
            for(size_t i=0;i<snap.runners.size();i++)snap.runners[i].rank=int(i)+1;
        }
    }
    static uintptr_t previous=0;
    if(snap.active&&snap.identity!=previous){previous=snap.identity;logLine("Race detected: "+std::to_string(snap.runners.size())+" runners; first: "+snap.runners[0].name+"; style="+std::to_string(snap.runners[0].style));}
    if(!snap.active)previous=0;
    static uintptr_t reportedFinish=0;
    bool allFinished=snap.active&&std::all_of(snap.runners.begin(),snap.runners.end(),[](const Runner& r){return r.finished;});
    if(allFinished&&reportedFinish!=snap.identity){reportedFinish=snap.identity;std::string order="Race finished; podium gates:";for(size_t i=0;i<std::min(size_t(3),snap.runners.size());i++)order+=" "+std::to_string(snap.runners[i].gate);logLine(order);}
    if(!allFinished)reportedFinish=0;
    {std::lock_guard<std::mutex> lock(stateMutex);if(!snap.active||raceState.identity!=snap.identity)for(int& pick:settings.picks)pick=-1;raceState=std::move(snap);}
}
}
bool initTelemetry(GetApi api){
    auto raw=reinterpret_cast<void*(*)(const char*)>(api("il2cpp_resolve_symbol"));if(!raw)return false;
#define HOST(var,key) var=reinterpret_cast<decltype(var)>(api(key));if(!var)return false
#define RAW(var,key) var=reinterpret_cast<decltype(var)>(raw(key));if(!var)return false
    HOST(image,"il2cpp_get_assembly_image");HOST(klass,"il2cpp_get_class");HOST(method,"il2cpp_get_method");HOST(field,"il2cpp_get_field_from_name");HOST(fieldValue,"il2cpp_get_field_value");HOST(singleton,"il2cpp_get_singleton_like_instance");HOST(unbox,"il2cpp_unbox");HOST(stringChars,"il2cpp_string_chars");HOST(stringLength,"il2cpp_string_length");HOST(mainThread,"il2cpp_get_main_thread");HOST(schedule,"il2cpp_schedule_on_thread");
    RAW(methodReturnType,"il2cpp_method_get_return_type");RAW(classFromType,"il2cpp_class_from_type");RAW(classIsEnum,"il2cpp_class_is_enum");RAW(enumBaseType,"il2cpp_class_enum_basetype");
    RAW(runtimeInvoke,"il2cpp_runtime_invoke");RAW(objectClass,"il2cpp_object_get_class");RAW(parentClass,"il2cpp_class_get_parent");RAW(classFields,"il2cpp_class_get_fields");RAW(fieldName,"il2cpp_field_get_name");RAW(fieldType,"il2cpp_field_get_type");RAW(typeType,"il2cpp_type_get_type");RAW(classProperties,"il2cpp_class_get_properties");RAW(propertyName,"il2cpp_property_get_name");RAW(propertyGetter,"il2cpp_property_get_get_method");RAW(arrayLength,"il2cpp_array_length");RAW(arrayHeader,"il2cpp_array_object_header_size");
#undef HOST
#undef RAW
    return true;
}
void scheduleTelemetry(){
    auto now=GetTickCount64();if(now-lastRequest<50||failed)return;
    if(pending.load()){if(now-lastRequest<5000)return;pending=false;logLine("Telemetry callback stalled; retrying main-thread scheduling.");}
    if(pending.exchange(true))return;lastRequest=now;
    auto thread=mainThread();if(thread)schedule(thread,poll);else pending=false;
}
