#include "dominator.h"
#include "preview_scene.h"
#include <d3d11.h>
#include <dxgi.h>
#include "imgui.h"
#include "backends/imgui_impl_dx11.h"
#include "json.hpp"
#include <wincodec.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <unordered_map>
using Json=nlohmann::json;
namespace {
struct Preview : preview::View {bool enabled=false,demo=true;};
Preview cfg;std::mutex previewMutex;unsigned long long readAt=0;
ImGuiContext* context=nullptr;ID3D11Device* device=nullptr;ID3D11DeviceContext* dc=nullptr;IDXGISwapChain* activeChain=nullptr;
preview::Scene scene;preview::Theme theme;unsigned long long lastTick=0;
Json read(const wchar_t* name){auto f=_wfopen((baseDir+L"\\"+name).c_str(),L"rb");if(!f)return Json::object();fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);std::string s;if(n>0&&n<65536){s.resize(n);if(fread(s.data(),1,n,f)!=size_t(n))s.clear();}fclose(f);auto v=Json::parse(s,nullptr,false);return v.is_object()?v:Json::object();}
void load(){const auto now=GetTickCount64();if(now-readAt<500)return;readAt=now;auto p=read(L"game-preview.json");auto flag=[&](const char* key,bool& v){if(p.contains(key)&&p[key].is_boolean())v=p[key];};flag("enabled",cfg.enabled);flag("demo",cfg.demo);auto number=[&](const char* key,float& v,float lo,float hi){if(p.contains(key)&&p[key].is_number()){float n=p[key];if(std::isfinite(n))v=std::clamp(n,lo,hi);}};number("x",cfg.x,0,3840);number("y",cfg.y,0,2160);number("scale",cfg.scale,.45f,2);number("opacity",cfg.opacity,.45f,1);auto h=read(L"obs-settings.json");for(auto pair:{std::make_pair("tournament",&theme.tournament),{"matchup",&theme.matchup},{"round",&theme.round},{"stage",&theme.stage}})if(h.contains(pair.first)&&h[pair.first].is_string())*pair.second=h[pair.first].get<std::string>().substr(0,256);
    if(h.contains("compact")&&h["compact"].is_boolean())theme.compact=h["compact"];
    if(h.contains("indicators")&&h["indicators"].is_boolean())theme.indicators=h["indicators"];
    if(h.contains("motion")&&h["motion"].is_number()){float n=h["motion"];if(std::isfinite(n))theme.motion=std::clamp(n,80.f,1000.f);}
    theme.picks.clear();if(h.contains("picks")&&h["picks"].is_array())for(auto& value:h["picks"])
        if(theme.picks.size()<3&&value.is_number_integer()&&value>=1&&value<=32)theme.picks.push_back(value);
}
void save(){Json p={{"enabled",cfg.enabled},{"demo",cfg.demo},{"x",cfg.x},{"y",cfg.y},{"scale",cfg.scale},{"opacity",cfg.opacity}};auto path=baseDir+L"\\game-preview.json",temp=path+L".native.tmp";auto s=p.dump(2);auto f=_wfopen(temp.c_str(),L"wb");if(!f)return;bool ok=fwrite(s.data(),1,s.size(),f)==s.size();ok=fclose(f)==0&&ok;if(ok)MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH);readAt=GetTickCount64();}
template<class T>void release(T*& p){if(p){p->Release();p=nullptr;}}
bool init(IDXGISwapChain* chain){
    if(FAILED(chain->GetDevice(__uuidof(ID3D11Device),reinterpret_cast<void**>(&device))))return false;
    device->GetImmediateContext(&dc);context=ImGui::CreateContext();ImGui::SetCurrentContext(context);
    scene.initialize(device,baseDir+L"\\assets");
    if(!ImGui_ImplDX11_Init(device,dc)){scene.shutdown();ImGui::DestroyContext(context);context=nullptr;release(dc);release(device);return false;}
    activeChain=chain;lastTick=GetTickCount64();return true;
}
RaceSnapshot sample(float time){
    RaceSnapshot s;s.active=s.demo=true;s.identity=999999;s.time=std::fmod(time,60.f);
    s.course=1600;s.trackName="Nakayama";s.groundType=1;s.groundCondition=2;s.weather=2;s.season=4;
    const char* names[]={"Oguri Cap","Oguri Cap","Gold Ship","Daiwa Scarlet","Mejiro McQueen","Kitasan Black","Rice Shower","Special Week","Silence Suzuka","Tokai Teio","Vodka","Nice Nature","Agnes Tachyon","Tamamo Cross","El Condor Pasa","Grass Wonder","King Halo","Haru Urara"};
    const char* variants[]={"Starlight Beat","Ashen Miracle","Red Strife","Peak Blue","Frontline Elegance","Gilded Shrine to Glory","Rosy Dreams","Special Dreamer","Innocent Silence","Peak Joy","Wild Top Gear","Poinsettia Ribbon","tach-nology","Fast as Lightning","El☆Número 1","Stone-Piercing Blue","King of Emeralds","Bestest Prize ♪"};
    int cards[]={100601,100602,100701,100901,101301,106801,103001,100101,100201,100301,100801,106001,103201,102101,101401,101101,106101,105201};
    const char* players[]={"ScarletAce","CrimsonFox","NightRunner","GoldRush","Moonlight","BlackCrown"};
    for(int i=0;i<18;i++){
        Runner r;r.id=i;r.gate=i+1;r.card=cards[i];r.name=names[i];r.variant=variants[i];r.trainer=players[i/3];
        r.style=i%4+1;r.player=i==0;r.distance=1200+(18-i)*3+9*std::sin(time*.65f+i*1.6f);
        r.speed=(68+std::sin(time+i)*4)/3.6f;int lamp=int(std::floor(time/3+i))%8;
        r.rushed=lamp==0;r.staminaEmpty=lamp==1;r.lateStart=lamp==2;r.blocked=lamp==3;s.runners.push_back(r);
    }
    std::sort(s.runners.begin(),s.runners.end(),[](auto&a,auto&b){return a.distance>b.distance;});
    for(size_t i=0;i<s.runners.size();i++)s.runners[i].rank=int(i)+1;return s;
}
bool (*heading)(void*,const char*);bool (*label)(void*,const char*);bool (*checkbox)(void*,const char*,bool*);bool (*slider)(void*,const char*,float*,float,float);
void menu(void* ui,void*){std::lock_guard<std::mutex> lock(previewMutex);load();heading(ui,"DDT2 / DOMINATOR PREVIEW");label(ui,"OBS-style race preview. F8 hides or shows it.");bool changed=checkbox(ui,"Show overlay inside the game",&cfg.enabled);changed=checkbox(ui,"Sample racers (never scored)",&cfg.demo)||changed;if(slider){changed=slider(ui,"Overlay X",&cfg.x,0,1800)||changed;changed=slider(ui,"Overlay Y",&cfg.y,0,1000)||changed;changed=slider(ui,"Overlay scale",&cfg.scale,.45f,2)||changed;}if(changed)save();label(ui,"F8 toggles this preview. Tournament desk: 127.0.0.1:27840");}
}
bool registerGamePreview(GetApi api){heading=reinterpret_cast<decltype(heading)>(api("gui_ui_heading"));label=reinterpret_cast<decltype(label)>(api("gui_ui_label"));checkbox=reinterpret_cast<decltype(checkbox)>(api("gui_ui_checkbox"));slider=reinterpret_cast<decltype(slider)>(api("gui_ui_slider_f32"));auto reg=reinterpret_cast<bool(*)(void(*)(void*,void*),void*)>(api("gui_register_menu_section"));return heading&&label&&checkbox&&reg&&reg(menu,nullptr);}
void drawGamePreview(void* swap){std::lock_guard<std::mutex> lock(previewMutex);load();auto chain=static_cast<IDXGISwapChain*>(swap);if(!chain)return;DXGI_SWAP_CHAIN_DESC desc{};if(FAILED(chain->GetDesc(&desc))||!IsWindowVisible(desc.OutputWindow)||IsIconic(desc.OutputWindow))return;DWORD owner=0;GetWindowThreadProcessId(desc.OutputWindow,&owner);if(owner!=GetCurrentProcessId())return;SHORT f=GetAsyncKeyState(VK_F8);static bool prior=false;bool down=(f&0x8000)!=0;DWORD fg=0;GetWindowThreadProcessId(GetForegroundWindow(),&fg);if(((f&1)||(down&&!prior))&&fg==owner){cfg.enabled=!cfg.enabled;save();}prior=down;if(!cfg.enabled)return;
 auto previous=ImGui::GetCurrentContext();if(!context&&!init(chain)){ImGui::SetCurrentContext(previous);return;}if(chain!=activeChain){ImGui::SetCurrentContext(previous);return;}ImGui::SetCurrentContext(context);ID3D11Texture2D* back=nullptr;ID3D11RenderTargetView* target=nullptr;if(FAILED(chain->GetBuffer(0,__uuidof(ID3D11Texture2D),reinterpret_cast<void**>(&back)))){ImGui::SetCurrentContext(previous);return;}D3D11_TEXTURE2D_DESC td{};back->GetDesc(&td);HRESULT hr=device->CreateRenderTargetView(back,nullptr,&target);back->Release();if(FAILED(hr)){ImGui::SetCurrentContext(previous);return;}auto now=GetTickCount64();float dt=std::clamp(float(now-lastTick)/1000,.001f,.1f);lastTick=now;RaceSnapshot snapshot;{std::lock_guard<std::mutex> stateLock(stateMutex);snapshot=raceState;}if(cfg.demo)snapshot=sample(float(now%180000)/1000);else if(now-snapshot.stamp>2000)snapshot.active=false;
 auto& io=ImGui::GetIO();io.DisplaySize={float(td.Width),float(td.Height)};io.DeltaTime=dt;ImGui_ImplDX11_NewFrame();ImGui::NewFrame();scene.draw(snapshot,float(td.Width),float(td.Height),dt,cfg,theme,float(now%180000)/1000);ImGui::Render();ID3D11RenderTargetView* old[D3D11_SIMULTANEOUS_RENDER_TARGET_COUNT]{};ID3D11DepthStencilView* depth=nullptr;dc->OMGetRenderTargets(D3D11_SIMULTANEOUS_RENDER_TARGET_COUNT,old,&depth);dc->OMSetRenderTargets(1,&target,nullptr);ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());dc->OMSetRenderTargets(D3D11_SIMULTANEOUS_RENDER_TARGET_COUNT,old,depth);for(auto*&t:old)release(t);release(depth);release(target);ImGui::SetCurrentContext(previous);
}
