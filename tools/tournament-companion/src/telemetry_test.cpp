// Contract tests for the read-only bridge; this process never opens the game.
#include "telemetry.cpp"
#include <cassert>
#include <deque>
#include <variant>
#include <limits>
#include <cstdio>
#include <cstdlib>
#undef assert
#define assert(expression) do { if(!(expression)) { fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#expression); std::exit(1); } } while(false)

std::mutex stateMutex;
RaceSnapshot raceState;
Settings settings;
std::wstring baseDir;
void logLine(const std::string& s){printf("%s\n",s.c_str());}

namespace fixture {
using Value=std::variant<int,float,bool,void*>;
struct Type {int code;};
struct Field {std::string name;Type type;};
struct Method {std::string name,key;Type type;};
struct Property {std::string name;Method getter;};
struct Class {Class* parent=nullptr;std::deque<Field> fields;std::deque<Property> props;std::deque<Method> methods;};
struct Object {Class* cls;std::unordered_map<std::string,Value> values;std::wstring text;};
struct Array {char header[32]{};void* entries[32]{};};
Class trackClass;
Class managerClass,horseManagerClass,horseBaseClass,horseClass,dataClass,responseClass,raceClass,readerClass,stringClass,masterManagerType,masterCardsType,cardDataType,frameClass;
Object masterManager{&masterManagerType},masterCards{&masterCardsType};
Object regularTitle{&stringClass,{},L"[Starlight Beat]"},holidayTitle{&stringClass,{},L"[Ashen Miracle]"};
Object regularCard{&cardDataType,{{"Titlename",&regularTitle}}},holidayCard{&cardDataType,{{"Titlename",&holidayTitle}}};
Object trackName{&stringClass,{},L"Nakayama"},track{&trackClass,{{"Name",&trackName}}};
Object manager{&managerClass},horses{&horseManagerClass},info{&raceClass},reader{&readerClass};
std::deque<Object> runners,data,responses,names,trainers,clubs,creators;
std::deque<Object> frames;
bool frameEnabled=false;
Array array;
size_t count=3;
unsigned headerSize=32;
bool inRace=true,threadReady=true,dropCallback=false,invokeException=false;
int scheduled=0,fieldReads=0;
void* raw(Value& v){return std::visit([](auto& x)->void*{return &x;},v);}
void addField(Class& c,const char* name,int type){c.fields.push_back({name,{type}});}
void addProperty(Class& c,const char* name,int type){c.props.push_back({name,{std::string("get_")+name,name,{type}}});}
void* getImage(const char*){return &managerClass;}
void* getClass(void*,const char*,const char* name){return !strcmp(name,"MasterDataManager")?&masterManagerType:&managerClass;}
void* getMethod(void* ptr,const char* name,int){for(auto c=static_cast<Class*>(ptr);c;c=c->parent){for(auto& m:c->methods)if(m.name==name)return &m;for(auto& p:c->props)if(p.getter.name==name)return &p.getter;}return nullptr;}
void* getField(void* ptr,const char* name){for(auto c=static_cast<Class*>(ptr);c;c=c->parent)for(auto& f:c->fields)if(f.name==name)return &f;return nullptr;}
void fieldValue(void* ptr,void* fp,void* out){auto& f=*static_cast<Field*>(fp);auto& v=static_cast<Object*>(ptr)->values.at(f.name);size_t n=f.type.code==0x12||f.type.code==0xe?sizeof(void*):(f.type.code==2||f.type.code==4||f.type.code==5)?1:4;memcpy(out,raw(v),n);++fieldReads;}
void* singleton(void* cls){return cls==&masterManagerType?&masterManager:inRace?&manager:nullptr;}
void* invoke(void* mp,void* ptr,void** args,void** exc){auto& m=*static_cast<Method*>(mp);if(invokeException){*exc=&manager;return nullptr;}
    if(m.name=="GetFrameDataFromCache"){assert(ptr==&reader&&args);int i=*static_cast<int*>(args[0]);return frameEnabled&&i>=0&&i<int(frames.size())?&frames[i]:nullptr;}if(m.name=="Get"){assert(ptr==&masterCards&&args);int id=*static_cast<int*>(args[0]);return id==100601?&regularCard:id==100602?&holidayCard:nullptr;}auto& o=ptr?*static_cast<Object*>(ptr):manager;auto& v=o.values.at(m.key);return m.type.code==0x12||m.type.code==0xe?std::get<void*>(v):raw(v);}
void* unbox(void* ptr){return ptr;}
void* objClass(void* p){return static_cast<Object*>(p)->cls;}
void* parent(void* p){return static_cast<Class*>(p)->parent;}
template<class T>void* next(std::deque<T>& list,void** it){size_t i=reinterpret_cast<size_t>(*it);if(i>=list.size())return nullptr;*it=reinterpret_cast<void*>(i+1);return &list[i];}
void* fields(void* c,void** it){return next(static_cast<Class*>(c)->fields,it);}
void* props(void* c,void** it){return next(static_cast<Class*>(c)->props,it);}
const char* fieldName(void* f){return static_cast<Field*>(f)->name.c_str();}
void* fieldType(void* f){return &static_cast<Field*>(f)->type;}
int type(void* t){return static_cast<Type*>(t)->code;}
const char* propName(void* p){return static_cast<Property*>(p)->name.c_str();}
void* getter(void* p){return &static_cast<Property*>(p)->getter;}
void* returnType(void* p){return &static_cast<Method*>(p)->type;}
void* classFromType(void*){return &dataClass;}
bool isEnum(void*){return false;}
void* enumType(void*){static Type t{8};return &t;}
unsigned short* chars(void* p){return reinterpret_cast<unsigned short*>(static_cast<Object*>(p)->text.data());}
int length(void* p){return int(static_cast<Object*>(p)->text.size());}
size_t arrayLen(void*){return count;}
unsigned arrayHeader(){return headerSize;}
void* thread(){return threadReady?&manager:nullptr;}
void schedule(void*,void(*callback)()){++scheduled;if(!dropCallback)callback();}
void setup(){
    addProperty(masterManagerType,"masterCardData",0x12);masterManager.values["masterCardData"]=&masterCards;
    masterCardsType.methods.push_back({"Get","",{0x12}});addProperty(cardDataType,"Titlename",0xe);
    horseClass.parent=&horseBaseClass;
    addField(horseClass,"_simulateReader",0x12);
    readerClass.methods.push_back({"GetFrameDataFromCache","",{0x12}});
    addField(frameClass,"TemptationMode",5);addField(frameClass,"BlockFrontHorseIndex",4);
    addField(frameClass,"Hp",0xc);
    addField(managerClass,"_horseManager",0x12);addProperty(managerClass,"RaceInfo",0x12);
    managerClass.methods.push_back({"IsPaused","paused",{2}});
    manager.values={{"_horseManager",&horses},{"RaceInfo",&info},{"paused",true}};
    addField(horseManagerClass,"_reader",0x12);
    horseManagerClass.methods.push_back({"GetHorseRaceInfos","array",{0x12}});
    horseManagerClass.methods.push_back({"GetPlayerHorseIndex","player",{8}});
    horses.values={{"_reader",&reader},{"array",&array},{"player",1}};
    addField(readerClass,"_curTime",0xc);reader.values={{"_curTime",12.5f}};
    addProperty(raceClass,"CourseDistance",8);info.values={{"CourseDistance",2400}};
    addProperty(trackClass,"Name",0xe);addProperty(raceClass,"RaceTrack",0x12);info.values["RaceTrack"]=&track;
    for(auto field:{"RaceTrackId","GroundType","GroundCondition","Weather","Season"})addProperty(raceClass,field,8);
    info.values["RaceTrackId"]=10005;info.values["GroundType"]=1;info.values["GroundCondition"]=2;info.values["Weather"]=2;info.values["Season"]=4;
    addProperty(horseBaseClass,"HorseData",0x12);addProperty(horseBaseClass,"CharaName",0xe);addProperty(horseBaseClass,"CurOrder",8);
    addProperty(horseBaseClass,"FinishOrder",8);
    addProperty(horseBaseClass,"IsTemptation",2);addProperty(horseBaseClass,"IsClog",2);addProperty(horseBaseClass,"IsBadStart",2);addProperty(horseBaseClass,"PositionKeepMode",8);
    addField(horseBaseClass,"_distance",0xc);addField(horseBaseClass,"_lastSpeed",0xc);addField(horseBaseClass,"_hp",0xc);addField(horseBaseClass,"_maxHp",0xc);
    horseBaseClass.methods.push_back({"IsFinished","finished",{2}});
    horseBaseClass.methods.push_back({"GetHp","_hp",{0xc}});horseBaseClass.methods.push_back({"GetMaxHp","_maxHp",{0xc}});
    addProperty(dataClass,"GateNo",8);addProperty(dataClass,"CardId",8);addField(dataClass,"<charaId>k__BackingField",8);addField(dataClass,"_responseHorseData",0x12);
    addField(responseClass,"running_style",8);addField(responseClass,"card_id",8);
    addProperty(dataClass,"TrainerName",0xe);addField(responseClass,"trainer_name",0xe);addField(responseClass,"owner_trainer_name",0xe);addField(responseClass,"circle_name",0xe);
    for(int i=0;i<3;i++){
        names.push_back({&stringClass,{},i==0?L"Gentildonna":i==1?L"Daiwa Scarlet":L"Gold Ship"});
        trainers.push_back({&stringClass,{},i==0?L"RedTrainer":i==1?L"BlueTrainer":L"GoldTrainer"});
        clubs.push_back({&stringClass,{},L"Example Club"});creators.push_back({&stringClass,{},i==0?L"UmaOwner":L""});
        responses.push_back({&responseClass,{{"running_style",i+1},{"card_id",100101+i*100},{"trainer_name",&trainers.back()},{"owner_trainer_name",&creators.back()},{"circle_name",i==0?&clubs.back():nullptr}}});
        data.push_back({&dataClass,{{"GateNo",i+1},{"CardId",0},{"<charaId>k__BackingField",1001+i},{"_responseHorseData",&responses.back()},{"TrainerName",i==1?nullptr:&trainers.back()}}});
        runners.push_back({&horseClass,{{"HorseData",&data.back()},{"CharaName",&names.back()},{"CurOrder",2-i},{"_distance",100.f+float(i)*10},{"_lastSpeed",20.f},{"_hp",700.f},{"_maxHp",1000.f},{"finished",false}}});
        array.entries[i]=&runners.back();
        runners.back().values["_simulateReader"]=&reader;
        frames.push_back({&frameClass,{{"TemptationMode",0},{"BlockFrontHorseIndex",-1},{"Hp",500.f}}});
        runners.back().values["FinishOrder"]=i;
        runners.back().values["IsTemptation"]=false;runners.back().values["IsClog"]=false;runners.back().values["IsBadStart"]=false;runners.back().values["PositionKeepMode"]=0;
    }
}
void* api(const char* name){
#define MAP(key,value) if(!strcmp(name,key))return reinterpret_cast<void*>(value)
    MAP("il2cpp_resolve_symbol",api);MAP("il2cpp_get_assembly_image",getImage);MAP("il2cpp_get_class",getClass);MAP("il2cpp_get_method",getMethod);MAP("il2cpp_get_field_from_name",getField);MAP("il2cpp_get_field_value",fieldValue);MAP("il2cpp_get_singleton_like_instance",singleton);MAP("il2cpp_unbox",unbox);MAP("il2cpp_string_chars",chars);MAP("il2cpp_string_length",length);MAP("il2cpp_get_main_thread",thread);MAP("il2cpp_schedule_on_thread",schedule);
    MAP("il2cpp_runtime_invoke",invoke);MAP("il2cpp_object_get_class",objClass);MAP("il2cpp_class_get_parent",parent);MAP("il2cpp_class_get_fields",fields);MAP("il2cpp_field_get_name",fieldName);MAP("il2cpp_field_get_type",fieldType);MAP("il2cpp_type_get_type",type);MAP("il2cpp_class_get_properties",props);MAP("il2cpp_property_get_name",propName);MAP("il2cpp_property_get_get_method",getter);MAP("il2cpp_array_length",arrayLen);MAP("il2cpp_array_object_header_size",arrayHeader);MAP("il2cpp_method_get_return_type",returnType);MAP("il2cpp_class_from_type",classFromType);MAP("il2cpp_class_is_enum",isEnum);MAP("il2cpp_class_enum_basetype",enumType);
#undef MAP
    return nullptr;
}
}
int main(){
    setvbuf(stdout,nullptr,_IONBF,0);
    using namespace fixture;puts("Setting up mock IL2CPP runtime...");setup();assert(initTelemetry(api));puts("Reading initial race...");poll();
    assert(raceState.active&&raceState.runners.size()==3&&raceState.paused&&raceState.course==2400&&raceState.time==12.5f);
    assert(raceState.trackName=="Nakayama"&&raceState.trackId==10005&&raceState.groundType==1&&raceState.groundCondition==2&&raceState.weather==2&&raceState.season==4);
    assert(raceState.runners[0].id==2&&raceState.runners[0].rank==1&&raceState.runners[1].player);
    assert(raceState.runners[0].style==3&&raceState.runners[0].chara==1003&&raceState.runners[0].name=="Gold Ship");
    assert(raceState.runners[0].speed==20&&raceState.runners[0].gate==3);
    assert(raceState.runners[0].trainer=="GoldTrainer"&&raceState.runners[1].trainer=="BlueTrainer");
    assert(raceState.runners[2].creator=="UmaOwner"&&raceState.runners[2].club=="Example Club");
    // Two outfits of the same character must retain distinct card IDs and official names.
    names[0].text=names[1].text=L"Oguri Cap";
    data[0].values["CardId"]=100601;data[1].values["CardId"]=100602;
    data[0].values["<charaId>k__BackingField"]=data[1].values["<charaId>k__BackingField"]=1006;
    poll();assert(raceState.runners[2].card==100601&&raceState.runners[1].card==100602);
    assert(fullUmaName(raceState.runners[2])=="Oguri Cap (Starlight Beat)");
    assert(fullUmaName(raceState.runners[1])=="Oguri Cap (Ashen Miracle)");
    data[1].values["CardId"]=0;responses[1].values["card_id"]=100602;poll();
    assert(raceState.runners[1].variant=="Ashen Miracle"); // Response fallback remains variant-specific.
    responses[1].values["card_id"]=0;poll();assert(raceState.runners[1].card==0&&raceState.runners[1].variant.empty());
    data[1].values["CardId"]=999999;poll();assert(raceState.runners[1].variant.empty());
    data[1].values["CardId"]=100602;poll();assert(raceState.runners[1].variant=="Ashen Miracle");
    assert(teamLabelFor(raceState.runners[0],settings)=="TEAM TBD");
    runners[2].values["IsTemptation"]=true;runners[2].values["IsClog"]=true;runners[2].values["IsBadStart"]=true;runners[2].values["PositionKeepMode"]=4;
    poll();assert(raceState.runners[0].rushed&&raceState.runners[0].blocked&&raceState.runners[0].paceDown&&!raceState.runners[0].paceUp&&!raceState.runners[0].lateStart);
    reader.values["_curTime"]=1.f;poll();assert(raceState.runners[0].lateStart);
    reader.values["_curTime"]=0.f;poll();assert(!raceState.runners[0].lateStart); // Never reveal late start during introductions.
    reader.values["_curTime"]=12.5f;runners[2].values["IsTemptation"]=false;runners[2].values["IsClog"]=false;
    for(int mode:{1,2,3,5}){runners[2].values["PositionKeepMode"]=mode;poll();assert(raceState.runners[0].paceUp&&!raceState.runners[0].paceDown&&!raceState.runners[0].rushed&&!raceState.runners[0].blocked);}
    runners[2].values["PositionKeepMode"]=-1;poll();assert(!raceState.runners[0].paceUp&&!raceState.runners[0].paceDown);
    runners[2].values["PositionKeepMode"]=0;
    frameEnabled=true;frames[2].values["TemptationMode"]=4;frames[2].values["BlockFrontHorseIndex"]=0;
    poll();assert(raceState.runners[0].rushed&&raceState.runners[0].blocked); // Gate/index zero is a valid blocker.
    frames[2].values["TemptationMode"]=0;frames[2].values["BlockFrontHorseIndex"]=-1;
    poll();assert(!raceState.runners[0].rushed&&!raceState.runners[0].blocked); // Signed-byte sentinel clears the lamp.
    frames[2].values["BlockFrontHorseIndex"]=2;poll();assert(!raceState.runners[0].blocked); // Never blocked by self.
    // Current replay HP wins over the simulation getter. Unknown HP is not zero.
    assert(raceState.runners[0].hpKnown&&raceState.runners[0].hp==500&&!raceState.runners[0].staminaEmpty);
    frames[2].values["Hp"]=.01f;poll();assert(!raceState.runners[0].staminaEmpty);
    frames[2].values["Hp"]=0.f;poll();assert(raceState.runners[0].staminaEmpty);
    reader.values["_curTime"]=0.f;poll();assert(!raceState.runners[0].staminaEmpty);
    reader.values["_curTime"]=12.5f;
    runners[2].values["_distance"]=2400.f;poll();assert(!raceState.runners[0].staminaEmpty);
    runners[2].values["_distance"]=2399.f;poll();assert(raceState.runners[0].staminaEmpty);
    runners[2].values["finished"]=true;poll();assert(!raceState.runners[0].staminaEmpty);
    runners[2].values["finished"]=false;runners[2].values["_distance"]=120.f;
    frames[2].values["Hp"]=50.f;poll();assert(!raceState.runners[0].staminaEmpty);
    frames[2].values["Hp"]=std::numeric_limits<float>::quiet_NaN();runners[2].values["_hp"]=std::numeric_limits<float>::quiet_NaN();
    poll();assert(!raceState.runners[0].hpKnown&&!raceState.runners[0].staminaEmpty);
    runners[2].values["_hp"]=700.f;poll();assert(raceState.runners[0].hpKnown&&raceState.runners[0].hp==700.f);
    frames[2].values["Hp"]=500.f;
    frameEnabled=false;
    assert(teamLabelFor(raceState.runners[2],settings)=="Example Club");
    strcpy(settings.teams[0].trainer,"GoldTrainer");strcpy(settings.teams[0].team,"Tournament Gold");
    assert(teamLabelFor(raceState.runners[0],settings)=="Tournament Gold");
    assert(stringMember(&runners[0],"distance").empty()); // Non-string metadata cannot be decoded as a username.
    data[2].values["TrainerName"]=static_cast<void*>(nullptr);responses[2].values["trainer_name"]=static_cast<void*>(nullptr);responses[2].values["owner_trainer_name"]=&creators[0];
    poll();assert(raceState.runners[0].trainer=="UmaOwner");
    responses[2].values["owner_trainer_name"]=static_cast<void*>(nullptr);poll();assert(raceState.runners[0].trainer.empty());
    data[2].values["TrainerName"]=&trainers[2];poll();
    settings.picks[0]=1;poll();assert(settings.picks[0]==1);
    runners[0].values["CurOrder"]=0;runners[2].values["CurOrder"]=2;poll();assert(raceState.runners[0].id==0);
    // Official finish data exists before the race; it must not reveal results early.
    runners[0].values["CurOrder"]=2;runners[2].values["CurOrder"]=0;poll();assert(raceState.runners[0].id==2);
    runners[0].values["finished"]=true;poll();assert(raceState.runners[0].id==0&&raceState.runners[1].id==2);
    for(auto& runner:runners)runner.values["finished"]=true;
    poll();assert(raceState.runners[0].id==0&&raceState.runners[1].id==1&&raceState.runners[2].id==2);
    assert(!raceState.runners[2].lateStart&&!raceState.runners[2].rushed&&!raceState.runners[2].blocked&&!raceState.runners[2].paceUp&&!raceState.runners[2].paceDown);
    runners[2].values["_distance"]=2600.f;poll();assert(raceState.runners[0].id==0); // Run-out cannot change the winner.
    for(auto& runner:runners)runner.values["finished"]=false;
    poll();assert(raceState.runners[0].id==2); // Seeking back resumes current positions.
    runners[2].values["_distance"]=120.f;
    runners[0].values["CurOrder"]=-1;poll();assert(raceState.runners[0].id==2); // Coherent fallback when any rank is invalid.
    runners[2].values["_distance"]=std::numeric_limits<float>::quiet_NaN();poll();assert(raceState.runners[0].id==1);
    assert(number<int>(&runners[0],"distance",-9)==-9); // No reinterpreting float storage as integer.
    count=33;poll();assert(!raceState.active&&raceState.runners.empty());count=3;
    headerSize=100;poll();assert(!raceState.active);headerSize=32;
    array.entries[1]=nullptr;poll();assert(raceState.runners.size()==2);array.entries[1]=&runners[1];
    invokeException=true;poll();assert(!raceState.active);invokeException=false;
    settings.picks[0]=2;inRace=false;poll();assert(!raceState.active&&settings.picks[0]==-1);inRace=true;
    threadReady=false;lastRequest=0;pending=false;scheduleTelemetry();assert(!pending&&scheduled==0);
    threadReady=true;lastRequest=0;scheduleTelemetry();assert(!pending&&scheduled==1&&raceState.active);
    dropCallback=true;lastRequest=0;scheduleTelemetry();assert(pending&&scheduled==2);scheduleTelemetry();assert(scheduled==2);
    lastRequest=GetTickCount64()-6000;dropCallback=false;scheduleTelemetry();assert(scheduled==3&&!pending);
    printf("PASS: live ordering, overtakes, identity reset, styles, names, player picks, pause, typed reflection, null/invalid arrays, managed exceptions, no-race clearing and scheduling recovery.\n");
}
