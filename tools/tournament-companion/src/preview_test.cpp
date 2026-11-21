// Uses WARP and an off-screen texture. Never creates a window, sends input,
// loads a game/plugin, or changes any installed configuration.
#include "preview_scene.h"
#include "backends/imgui_impl_dx11.h"
#include <wincodec.h>
#include <filesystem>
#include <stdexcept>
#include <cstdio>
#include <cmath>

namespace {
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void check(HRESULT value){if(FAILED(value))throw std::runtime_error("Off-screen Direct3D/WIC operation failed");}
template<class T>void release(T*& value){if(value){value->Release();value=nullptr;}}
void png(const std::filesystem::path& file,UINT width,UINT height,std::vector<unsigned char>& pixels){
    IWICImagingFactory* factory=nullptr;IWICStream* stream=nullptr;IWICBitmapEncoder* encoder=nullptr;IWICBitmapFrameEncode* frame=nullptr;
    check(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));
    check(factory->CreateStream(&stream));check(stream->InitializeFromFilename(file.c_str(),GENERIC_WRITE));
    check(factory->CreateEncoder(GUID_ContainerFormatPng,nullptr,&encoder));check(encoder->Initialize(stream,WICBitmapEncoderNoCache));
    check(encoder->CreateNewFrame(&frame,nullptr));check(frame->Initialize(nullptr));check(frame->SetSize(width,height));
    auto format=GUID_WICPixelFormat32bppRGBA;check(frame->SetPixelFormat(&format));
    // Windows' PNG encoder can negotiate BGRA instead of requested RGBA.
    auto encoded=pixels;
    if(IsEqualGUID(format,GUID_WICPixelFormat32bppBGRA))
        for(size_t i=0;i<encoded.size();i+=4)std::swap(encoded[i],encoded[i+2]);
    else require(IsEqualGUID(format,GUID_WICPixelFormat32bppRGBA),"Unsupported PNG pixel format");
    check(frame->WritePixels(height,width*4,UINT(encoded.size()),encoded.data()));check(frame->Commit());check(encoder->Commit());
    release(frame);release(encoder);release(stream);release(factory);
}
RaceSnapshot fixture(int count){
    RaceSnapshot race;race.active=true;race.demo=true;race.identity=15;race.time=3;race.course=2400;
    race.trackName="Tokyo";race.groundType=1;race.groundCondition=2;race.weather=2;race.season=4;
    const int cards[]={100602,100701,100601,103001,100901,101301};
    const char* names[]={"Oguri Cap","Gold Ship","Oguri Cap","Rice Shower","Daiwa Scarlet","Mejiro McQueen"};
    const char* variants[]={"Ashen Miracle","Red Strife","Starlight Beat","Rosy Dreams","Peak Blue","Frontline Elegance"};
    for(int i=0;i<count;i++){
        Runner r;r.id=i;r.rank=r.gate=i+1;r.card=cards[i%6];r.name=names[i%6];r.variant=variants[i%6];
        r.trainer=i==0?"@@ScarletAce":"CrimsonFox";r.style=i%4+1;r.distance=1500-i*3.5f;r.speed=20-i*.1f;
        r.rushed=i==0;r.staminaEmpty=i==1;r.lateStart=i==2;r.blocked=i==3;r.player=i==2;race.runners.push_back(r);
    }
    return race;
}
struct Harness {
    ID3D11Device* device=nullptr;ID3D11DeviceContext* dc=nullptr;preview::Scene scene;
    Harness(const std::wstring& assets){
        check(D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_WARP,nullptr,0,nullptr,0,D3D11_SDK_VERSION,&device,nullptr,&dc));
        ImGui::CreateContext();scene.initialize(device,assets);require(ImGui_ImplDX11_Init(device,dc),"ImGui backend init failed");
    }
    ~Harness(){scene.shutdown();ImGui_ImplDX11_Shutdown();ImGui::DestroyContext();release(dc);release(device);}
    std::vector<unsigned char> render(const RaceSnapshot& race,UINT w,UINT h,const preview::Theme& theme,float dt=.016f){
        D3D11_TEXTURE2D_DESC desc{};desc.Width=w;desc.Height=h;desc.MipLevels=desc.ArraySize=1;
        desc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;desc.SampleDesc.Count=1;desc.BindFlags=D3D11_BIND_RENDER_TARGET;
        ID3D11Texture2D* target=nullptr;ID3D11RenderTargetView* view=nullptr;
        check(device->CreateTexture2D(&desc,nullptr,&target));check(device->CreateRenderTargetView(target,nullptr,&view));
        float clear[]={0,0,0,0};dc->OMSetRenderTargets(1,&view,nullptr);dc->ClearRenderTargetView(view,clear);
        auto& io=ImGui::GetIO();io.DisplaySize={float(w),float(h)};io.DeltaTime=dt;
        ImGui_ImplDX11_NewFrame();ImGui::NewFrame();
        preview::View cfg;cfg.x=cfg.y=12;
        scene.draw(race,float(w),float(h),dt,cfg,theme,0);
        ImGui::Render();ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());
        desc.BindFlags=0;desc.Usage=D3D11_USAGE_STAGING;desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;
        ID3D11Texture2D* readback=nullptr;check(device->CreateTexture2D(&desc,nullptr,&readback));dc->CopyResource(readback,target);
        D3D11_MAPPED_SUBRESOURCE mapped{};check(dc->Map(readback,0,D3D11_MAP_READ,0,&mapped));
        std::vector<unsigned char> pixels(size_t(w)*h*4);
        for(UINT y=0;y<h;y++)memcpy(pixels.data()+size_t(y)*w*4,static_cast<unsigned char*>(mapped.pData)+size_t(y)*mapped.RowPitch,w*4);
        dc->Unmap(readback,0);dc->OMSetRenderTargets(0,nullptr,nullptr);release(readback);release(view);release(target);return pixels;
    }
};
void pixel(const std::vector<unsigned char>& pixels,UINT width,int x,int y,unsigned rgb){
    auto at=(size_t(y)*width+x)*4;
    require(pixels[at]==((rgb>>16)&255)&&pixels[at+1]==((rgb>>8)&255)&&pixels[at+2]==(rgb&255),"Unexpected preview pixel/color");
}
}
int wmain(int argc,wchar_t** argv){
    if(argc!=3){puts("Usage: PreviewTest.exe <assets-directory> <output-directory>");return 2;}
    try{
        check(CoInitializeEx(nullptr,COINIT_MULTITHREADED));
        std::filesystem::path output=argv[2];std::filesystem::create_directories(output);
        Harness harness(argv[1]);preview::Theme theme;
        theme.matchup="TEAM CRIMSON vs TEAM ECLIPSE";theme.stage="SF";theme.round="ROUND 1";
        auto race=fixture(10);
        auto pixels=harness.render(race,440,1080,theme);
        auto layout=harness.scene.measure(race,false);
        require(layout.row>=66&&layout.height<=1056,"Ten-runner panel does not fit");
        pixel(pixels,440,20,13,0xf3325f);
        pixel(pixels,440,25,230,0x54283b);
        pixel(pixels,440,25,230+int(layout.row),0x432230);
        pixel(pixels,440,25,230+int(layout.row)*2,0x341c27);
        png(output/L"preview-10.png",440,1080,pixels);
        // Artwork must be present; this region contains the right-hand figure.
        int artwork=0;for(int y=25;y<120;y++)for(int x=290;x<380;x++){
            size_t at=(size_t(y)*440+x)*4;if(pixels[at]>140&&pixels[at+1]>75&&pixels[at+2]>50)artwork++;
        }
        require(artwork>100,"Gentildonna artwork missing from native header");
        // Font metrics must expand rows, without shrinking names into metrics.
        auto longRace=fixture(18);longRace.identity++;
        longRace.runners[0].name="Sakura Bakushin O";
        longRace.runners[0].variant="Blossom in Learning, Championship Special with an Extra Long Outfit Name";
        longRace.runners[0].trainer="@@A very long player name that must be ellipsized";
        auto full=harness.render(longRace,440,1080,theme);
        auto fullLayout=harness.scene.measure(longRace,false);
        require(fullLayout.count==18&&fullLayout.row>66,"Long identities did not expand the row");
        for(auto size:std::vector<ImVec2>{{440,1080},{1280,720},{2560,1440},{3840,2160}}){
            float scale=preview::fit(fullLayout,size.x,size.y,size.y/1080);
            require(fullLayout.height*scale<=size.y-23.9f&&400*scale<=size.x-23.9f,"Auto-fit clips a full field");
        }
        png(output/L"preview-18-long.png",440,1080,full);
        theme.compact=true;
        auto compact=harness.render(fixture(18),440,1080,theme);
        png(output/L"preview-18-compact.png",440,1080,compact);
        require(harness.scene.measure(fixture(18),true).row<harness.scene.measure(fixture(18),false).row,"Compact mode does not reduce the row");
        auto high=harness.render(fixture(18),880,2160,theme);
        png(output/L"preview-4k.png",880,2160,high);
        RaceSnapshot idle;auto waiting=harness.render(idle,440,1080,theme);
        require(harness.scene.measure(idle,true).count==18,"Waiting frame lost the previous field size");
        png(output/L"preview-waiting.png",440,1080,waiting);
        theme.compact=false;harness.render(race,440,1080,theme);
        std::swap(race.runners[0],race.runners[1]);race.runners[0].rank=1;race.runners[1].rank=2;
        auto passing=harness.render(race,440,1080,theme,.06f);
        png(output/L"preview-overtake.png",440,1080,passing);
        // Mid-flight retargets must start from the current position without a jump.
        preview::Motion m{0,0,0,1,0,1,0};
        preview::advance(m,66,2,.1f,.32f);require(m.y>0&&m.y<66&&m.change<0,"Falling animation failed");
        float before=m.y;preview::advance(m,0,1,0,.32f);
        require(std::abs(m.y-before)<.001f&&m.change>0,"Retarget caused a position jump");
        preview::advance(m,0,1,.32f,.32f);require(std::abs(m.y)<.001f,"Animation did not settle");
        preview::advance(m,90,1,.32f,.32f);require(m.y==90,"Layout changes left a stale card position");
        Runner lamp;lamp.rushed=lamp.staminaEmpty=lamp.lateStart=lamp.blocked=true;
        require(preview::lights(lamp,3)==std::array<bool,4>{true,true,true,true},"Active indicators lost");
        require(!preview::lights(lamp,0)[2]&&!preview::lights(lamp,6)[2],"Late-start lamp survived its window");
        lamp.finished=true;require(preview::lights(lamp,3)==std::array<bool,4>{false,false,false,false},"Finished runner still flashes");
        puts("Native preview passed: artwork, podium colors, long identities, compact/full fields, 720p/4K fitting, overtakes, waiting frame and indicator lifecycle.");
    }catch(const std::exception& error){fprintf(stderr,"%s\n",error.what());return 1;}
    CoUninitialize();return 0;
}
