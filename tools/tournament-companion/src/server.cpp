#include <winsock2.h>
#include <ws2tcpip.h>
#include "dominator.h"
#include "json.hpp"
#include <algorithm>
#include <cstdio>
#include <cmath>
#include <map>
using Json=nlohmann::json;
namespace {
SOCKET listener=INVALID_SOCKET;
HANDLE workers[4]{};
std::atomic<bool> running=false;
std::mutex configMutex;
Json config;
unsigned short serverPort=27840;
unsigned long long revision=1;
Json defaults(){return {{"tournament","DOMINATOR NETWORK"},{"matchup","TEAM A vs TEAM B"},{"round","ROUND 1"},{"stage","TBD"},{"enabled",true},{"autoFit",true},{"compact",false},{"indicators",true},{"scale",1.0},{"motion",320},{"opacity",1.0},{"teams",Json::object()},{"picks",Json::array()}};}
Json validated(const Json& raw){
    Json out=defaults();if(!raw.is_object())return out;
    for(auto key:{"tournament","matchup","round","stage"})if(raw.contains(key)&&raw[key].is_string()&&raw[key].get_ref<const std::string&>().size()<=256)out[key]=raw[key];
    for(auto key:{"enabled","autoFit","compact","indicators"})if(raw.contains(key)&&raw[key].is_boolean())out[key]=raw[key];
    for(auto spec:{std::make_tuple("scale",0.45,2.0),std::make_tuple("motion",80.,1000.),std::make_tuple("opacity",0.45,1.)}){auto key=std::get<0>(spec);if(raw.contains(key)&&raw[key].is_number()){double v=raw[key].get<double>();if(std::isfinite(v))out[key]=std::clamp(v,std::get<1>(spec),std::get<2>(spec));}}
    if(raw.contains("teams")&&raw["teams"].is_object()){int count=0;for(auto& item:raw["teams"].items())if(count++<64&&item.key().size()<=192&&item.value().is_string()&&item.value().get_ref<const std::string&>().size()<=192)out["teams"][item.key()]=item.value();}
    if(raw.contains("picks")&&raw["picks"].is_array())for(auto& pick:raw["picks"])if(out["picks"].size()<3&&pick.is_number_integer()&&pick>=1&&pick<=32)out["picks"].push_back(pick);
    return out;
}
std::string readFile(const std::wstring& path){
    FILE* f=_wfopen(path.c_str(),L"rb");if(!f)return {};fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);
    std::string data;if(n>0&&n<=8*1024*1024){data.resize(n);if(fread(data.data(),1,n,f)!=size_t(n))data.clear();}fclose(f);return data;
}
std::string ini(const wchar_t* section,const wchar_t* key){wchar_t value[512];GetPrivateProfileStringW(section,key,L"",value,512,(baseDir+L"\\dominator.ini").c_str());int size=WideCharToMultiByte(CP_UTF8,0,value,-1,nullptr,0,nullptr,nullptr);if(size<=1)return {};std::string s(size,0);WideCharToMultiByte(CP_UTF8,0,value,-1,s.data(),size,nullptr,nullptr);s.pop_back();return s;}
bool save(const Json& value){
    auto path=baseDir+L"\\obs-settings.json",temp=path+L".tmp";auto text=value.dump(2);
    auto file=_wfopen(temp.c_str(),L"wb");if(!file)return false;bool ok=fwrite(text.data(),1,text.size(),file)==text.size();if(fclose(file)!=0)ok=false;
    return ok&&MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH);
}
void load(){
    auto text=readFile(baseDir+L"\\obs-settings.json");auto parsed=Json::parse(text,nullptr,false);
    config=validated(parsed);
    if(parsed.is_discarded()){
        for(auto pair:{std::make_pair(L"Name","tournament"),{L"Matchup","matchup"},{L"Round","round"},{L"Stage","stage"}}){auto value=ini(L"Tournament",pair.first);if(!value.empty())config[pair.second]=value;}
        for(int i=1;i<=64;i++){auto section=L"Team"+std::to_wstring(i);auto trainer=ini(section.c_str(),L"Trainer"),team=ini(section.c_str(),L"Name");if(!trainer.empty()&&!team.empty())config["teams"][trainer]=team;}
    }
}
std::string stateJson(){
    RaceSnapshot snap;{std::lock_guard<std::mutex> lock(stateMutex);snap=raceState;}
    Json cfg;unsigned long long rev;{std::lock_guard<std::mutex> lock(configMutex);cfg=config;rev=revision;}
    auto age=snap.stamp?GetTickCount64()-snap.stamp:999999;
    Json result={{"version","0.6.5"},{"active",snap.active&&age<2000},{"ageMs",age},{"paused",snap.paused},{"raceId",std::to_string(snap.identity)},{"time",snap.time},{"course",snap.course},{"config",cfg},{"revision",rev},{"runners",Json::array()}};
    result["raceInfo"]={{"trackId",snap.trackId},{"track",snap.trackName},{"distance",snap.course},{"surface",snap.groundType},{"going",snap.groundCondition},{"weather",snap.weather},{"season",snap.season}};
    if(!result["active"].get<bool>())return result.dump();
    for(auto& r:snap.runners){
        result["runners"].push_back({{"id",r.id},{"gate",r.gate},{"rank",r.rank},{"card",r.card},{"name",r.name},{"variant",r.variant},{"trainer",r.trainer},{"creator",r.creator},{"club",r.club},{"style",r.style},{"distance",r.distance},{"speed",r.speed*3.6f},{"finished",r.finished},{"player",r.player},{"hp",r.hpKnown?Json(r.hp):Json(nullptr)},{"paceMode",r.paceMode},{"lights",{{"rushed",r.rushed},{"paceUp",r.paceUp},{"paceDown",r.paceDown},{"stamina",r.staminaEmpty},{"lateStart",r.lateStart},{"blocked",r.blocked}}}});
    }
    return result.dump();
}
void sendAll(SOCKET socket,const std::string& text){size_t done=0;while(done<text.size()){int n=send(socket,text.data()+done,int(std::min(size_t(65536),text.size()-done)),0);if(n<=0)return;done+=n;}}
void reply(SOCKET client,int status,const char* type,const std::string& body){
    std::string header="HTTP/1.1 "+std::to_string(status)+(status==200?" OK":" Error")+"\r\nContent-Type: "+type+"\r\nContent-Length: "+std::to_string(body.size())+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'\r\n\r\n";
    sendAll(client,header);sendAll(client,body);
}
std::string lower(std::string s){for(char& c:s)c=char(tolower(static_cast<unsigned char>(c)));return s;}
void handle(SOCKET client){
    DWORD timeout=800;setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,reinterpret_cast<char*>(&timeout),sizeof(timeout));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,reinterpret_cast<char*>(&timeout),sizeof(timeout));
    std::string input;char chunk[4096];size_t end;
    while((end=input.find("\r\n\r\n"))==std::string::npos){int n=recv(client,chunk,sizeof(chunk),0);if(n<=0)return;input.append(chunk,n);if(input.size()>8192){reply(client,431,"text/plain","Headers too large");return;}}
    auto first=input.find("\r\n"),space=input.find(' '),next=input.find(' ',space+1);if(space==std::string::npos||next>=first){reply(client,400,"text/plain","Bad request");return;}
    auto verb=input.substr(0,space),path=input.substr(space+1,next-space-1);path=path.substr(0,path.find('?'));
    std::map<std::string,std::string> headers;
    for(size_t start=first+2;start<end;){auto stop=input.find("\r\n",start),colon=input.find(':',start);if(colon<stop){auto value=input.substr(colon+1,stop-colon-1);while(!value.empty()&&value.front()==' ')value.erase(0,1);auto key=lower(input.substr(start,colon-start));if(headers.count(key)){reply(client,400,"text/plain","Duplicate header");return;}headers[key]=value;}start=stop+2;}
    auto host="127.0.0.1:"+std::to_string(serverPort);if(headers["host"]!=host){reply(client,403,"text/plain","Use the 127.0.0.1 address");return;}
    if(verb=="POST"&&path=="/api/config"){
        if(headers["origin"]!="http://"+host||headers["x-dominator-settings"]!="1"||headers["content-type"].find("application/json")!=0){reply(client,403,"text/plain","Settings must be saved from the local control page");return;}
        auto lengthText=headers["content-length"];if(lengthText.empty()||lengthText.find_first_not_of("0123456789")!=std::string::npos||lengthText.size()>5){reply(client,400,"text/plain","Invalid length");return;}
        size_t length=std::stoul(lengthText);if(length>32768){reply(client,413,"text/plain","Settings too large");return;}
        auto body=input.substr(end+4);while(body.size()<length){int n=recv(client,chunk,int(std::min(sizeof(chunk),length-body.size())),0);if(n<=0)return;body.append(chunk,n);}if(body.size()!=length){reply(client,400,"text/plain","Invalid body");return;}
        auto parsed=Json::parse(body,nullptr,false);if(!parsed.is_object()){reply(client,400,"text/plain","Invalid JSON");return;}
        std::lock_guard<std::mutex> lock(configMutex);auto nextConfig=validated(parsed);if(!save(nextConfig)){reply(client,500,"text/plain","Settings could not be saved");return;}config=nextConfig;++revision;reply(client,200,"application/json; charset=utf-8",config.dump());return;
    }
    if(verb!="GET"){reply(client,405,"text/plain","Method not allowed");return;}
    if(path=="/api/state"){reply(client,200,"application/json; charset=utf-8",stateJson());return;}
    if(path=="/api/config"){std::lock_guard<std::mutex> lock(configMutex);reply(client,200,"application/json; charset=utf-8",config.dump());return;}
    std::wstring relative;const char* type="text/html; charset=utf-8";
    if(path=="/"||path=="/settings")relative=L"web\\settings.html";
    else if(path=="/overlay")relative=L"web\\overlay.html";
    else if(path=="/overlay.css"||path=="/settings.css"){relative=L"web\\"+std::wstring(path.begin()+1,path.end());type="text/css; charset=utf-8";}
    else if(path=="/overlay.js"||path=="/settings.js"||path=="/model.js"){relative=L"web\\"+std::wstring(path.begin()+1,path.end());type="text/javascript; charset=utf-8";}
    else if(path=="/assets/gentildonna.png"){relative=L"assets\\gentildonna.png";type="image/png";}
    else if(path.rfind("/assets/cards/",0)==0&&path.size()==24&&path.substr(20)==".png"&&path.substr(14,6).find_first_not_of("0123456789")==std::string::npos){relative=L"assets\\cards\\"+std::wstring(path.begin()+14,path.end());type="image/png";}
    else{reply(client,404,"text/plain","Not found");return;}
    auto bytes=readFile(baseDir+L"\\"+relative);reply(client,bytes.empty()?404:200,type,bytes.empty()?"Not found":bytes);
}
DWORD WINAPI worker(void*){while(running){auto client=accept(listener,nullptr,nullptr);if(client==INVALID_SOCKET)break;try{handle(client);}catch(const std::exception& error){logLine(error.what());reply(client,500,"text/plain","Request failed");}catch(...){reply(client,500,"text/plain","Request failed");}shutdown(client,SD_BOTH);closesocket(client);}return 0;}
}
bool startServer(unsigned short port){
    if(running)return true;serverPort=port;WSADATA data{};if(WSAStartup(MAKEWORD(2,2),&data))return false;
    listener=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);BOOL exclusive=TRUE;setsockopt(listener,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,reinterpret_cast<char*>(&exclusive),sizeof(exclusive));
    sockaddr_in address{};address.sin_family=AF_INET;address.sin_port=htons(port);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(listener==INVALID_SOCKET||bind(listener,reinterpret_cast<sockaddr*>(&address),sizeof(address))||listen(listener,16)){logLine("Could not bind localhost port "+std::to_string(port));if(listener!=INVALID_SOCKET)closesocket(listener);listener=INVALID_SOCKET;WSACleanup();return false;}
    load();running=true;for(auto& handle:workers){handle=CreateThread(nullptr,0,worker,nullptr,0,nullptr);if(!handle){stopServer();return false;}}return true;
}
void stopServer(){running=false;if(listener!=INVALID_SOCKET){closesocket(listener);listener=INVALID_SOCKET;}for(auto& handle:workers)if(handle){WaitForSingleObject(handle,5000);CloseHandle(handle);handle=nullptr;}WSACleanup();}
