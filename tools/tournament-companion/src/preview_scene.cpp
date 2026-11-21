#include "preview_scene.h"
#include <wincodec.h>
#include <algorithm>
#include <cmath>
#include <cstdio>

namespace preview {
namespace {
constexpr float panelWidth=400,headHeight=216,identityWidth=176;
template<class T> void release(T*& value){if(value){value->Release();value=nullptr;}}
size_t nextCodepoint(const std::string& value,size_t at){
    ++at;while(at<value.size()&&(static_cast<unsigned char>(value[at])&0xc0)==0x80)++at;
    return at;
}
float textWidth(ImFont* font,float size,const std::string& value){
    return font->CalcTextSizeA(size,100000,0,value.c_str()).x;
}
std::string ellipsis(ImFont* font,float size,std::string value,float width){
    if(textWidth(font,size,value)<=width)return value;
    while(!value.empty()&&textWidth(font,size,value+"...")>width){
        size_t at=value.size()-1;
        while(at>0&&(static_cast<unsigned char>(value[at])&0xc0)==0x80)--at;
        value.resize(at);
    }
    return value+"...";
}
std::vector<std::string> wrap(ImFont* font,float size,const std::string& text,float width){
    std::vector<std::string> lines;size_t begin=0;
    while(begin<text.size()){
        size_t end=begin,space=std::string::npos;
        while(end<text.size()){
            auto next=nextCodepoint(text,end);
            if(end>begin&&textWidth(font,size,text.substr(begin,next-begin))>width)break;
            if(text[end]==' ')space=end;
            end=next;
        }
        if(end<text.size()&&space!=std::string::npos&&space>begin)end=space;
        lines.push_back(text.substr(begin,end-begin));begin=end;
        while(begin<text.size()&&text[begin]==' ')++begin;
    }
    return lines;
}
float nameHeight(ImFont* normal,ImFont* bold,const Runner& r,bool compact){
    float h=wrap(bold,compact?13:14,r.name,identityWidth).size()*(compact?14:16);
    if(!r.variant.empty())h+=wrap(normal,compact?9.5f:10,"("+r.variant+")",identityWidth).size()*(compact?11:12);
    return h+(compact?1:2)+(compact?11:13);
}
std::string playerName(const Runner& r){
    auto at=r.trainer.find_first_not_of('@');
    return at==std::string::npos?"Player unavailable":r.trainer.substr(at);
}
std::string mapped(int value,const std::vector<std::string>& names,const char* fallback){
    return value>0&&size_t(value)<=names.size()?names[value-1]:fallback;
}
float bezier(float t,float p1,float p2){float u=1-t;return 3*u*u*t*p1+3*u*t*t*p2+t*t*t;}
float easing(float progress){
    if(progress<=0)return 0;if(progress>=1)return 1;
    float lo=0,hi=1;for(int i=0;i<14;i++){float mid=(lo+hi)/2;if(bezier(mid,.22f,.28f)<progress)lo=mid;else hi=mid;}
    return bezier((lo+hi)/2,.75f,1);
}
}
void advance(Motion& m,float target,int rank,float dt,float duration){
    if(m.rank!=rank||std::abs(m.to-target)>.01f){
        m.from=m.y;m.to=target;m.elapsed=0;
        if(m.rank!=rank){m.flash=1.4f;m.change=m.rank-rank;m.rank=rank;}
    }
    duration=std::max(.08f,duration);
    m.elapsed=std::min(duration,m.elapsed+std::max(0.f,dt));
    m.y=m.from+(m.to-m.from)*easing(m.elapsed/duration);
    m.flash=std::max(0.f,m.flash-dt);
}
std::array<bool,4> lights(const Runner& r,float time){
    return {!r.finished&&r.rushed,!r.finished&&r.staminaEmpty,
            !r.finished&&r.lateStart&&time>0&&time<6,!r.finished&&r.blocked};
}
float fit(const Layout& layout,float width,float height,float scale){
    return std::max(.05f,std::min({scale,(width-24)/panelWidth,(height-24)/layout.height}));
}
void Scene::initialize(ID3D11Device* device,const std::wstring& assetRoot){
    device_=device;assets_=assetRoot;
    auto& io=ImGui::GetIO();io.IniFilename=nullptr;io.LogFilename=nullptr;
    // Match atlas density to the displayed size: shrinking a single 40px font
    // down to an 8px label makes its strokes disappear at 1080p.
    static const ImWchar ranges[]={0x20,0x024f,0x2000,0x206f,0x2600,0x26ff,0};
    normal_=io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeui.ttf",20,nullptr,ranges);
    bold_=io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeuib.ttf",24,nullptr,ranges);
    if(!normal_)normal_=io.Fonts->AddFontDefault();if(!bold_)bold_=normal_;
    ImFontConfig small;small.RasterizerMultiply=1.15f;
    normalSmall_=io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeui.ttf",14,&small,ranges);
    boldSmall_=io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeuib.ttf",14,&small,ranges);
    normalLarge_=io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeui.ttf",40,nullptr,ranges);
    boldLarge_=io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeuib.ttf",48,nullptr,ranges);
    if(!normalSmall_)normalSmall_=normal_;if(!boldSmall_)boldSmall_=bold_;
    if(!normalLarge_)normalLarge_=normal_;if(!boldLarge_)boldLarge_=bold_;
}
void Scene::shutdown(){
    for(auto& entry:textures_)release(entry.second.view);
    textures_.clear();motion_.clear();device_=nullptr;
}
Scene::Texture& Scene::texture(const std::wstring& relative){
    auto inserted=textures_.emplace(relative,Texture{});
    auto& image=inserted.first->second;if(!inserted.second)return image;
    HRESULT co=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
    IWICImagingFactory* factory=nullptr;IWICBitmapDecoder* decoder=nullptr;
    IWICBitmapFrameDecode* frame=nullptr;IWICFormatConverter* converter=nullptr;
    auto file=assets_+L"\\"+relative;
    if(SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)))&&
       SUCCEEDED(factory->CreateDecoderFromFilename(file.c_str(),nullptr,GENERIC_READ,WICDecodeMetadataCacheOnLoad,&decoder))&&
       SUCCEEDED(decoder->GetFrame(0,&frame))&&SUCCEEDED(factory->CreateFormatConverter(&converter))&&
       SUCCEEDED(converter->Initialize(frame,GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom))){
        UINT w=0,h=0;converter->GetSize(&w,&h);
        if(w&&h&&w<=4096&&h<=4096){
            std::vector<unsigned char> pixels(size_t(w)*h*4);
            if(SUCCEEDED(converter->CopyPixels(nullptr,w*4,UINT(pixels.size()),pixels.data()))){
                D3D11_TEXTURE2D_DESC desc{};desc.Width=w;desc.Height=h;desc.MipLevels=desc.ArraySize=1;
                desc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;desc.SampleDesc.Count=1;
                desc.Usage=D3D11_USAGE_IMMUTABLE;desc.BindFlags=D3D11_BIND_SHADER_RESOURCE;
                D3D11_SUBRESOURCE_DATA data{pixels.data(),w*4,0};ID3D11Texture2D* tex=nullptr;
                if(SUCCEEDED(device_->CreateTexture2D(&desc,&data,&tex))){
                    if(SUCCEEDED(device_->CreateShaderResourceView(tex,nullptr,&image.view))){image.width=w;image.height=h;}
                    release(tex);
                }
            }
        }
    }
    release(converter);release(frame);release(decoder);release(factory);
    if(SUCCEEDED(co))CoUninitialize();return image;
}
Layout Scene::measure(const RaceSnapshot& race,bool compact) const{
    bool live=race.active&&!race.runners.empty();float row=compact?60.f:66.f;
    if(live)for(auto& r:race.runners)row=std::max({row,
        nameHeight(normal_,bold_,r,compact)+12,
        nameHeight(normalSmall_,boldSmall_,r,compact)+12,
        nameHeight(normalLarge_,boldLarge_,r,compact)+12});
    int count=live?int(race.runners.size()):lastCount_;
    return {count,row,headHeight+count*row+34};
}
void Scene::draw(const RaceSnapshot& race,float width,float height,float dt,
                 const View& view,const Theme& theme,float clock){
    const bool live=race.active&&!race.runners.empty();
    if(live)lastCount_=int(race.runners.size());
    auto layout=measure(race,theme.compact);const float W=panelWidth,H=layout.height,row=layout.row;
    float S=fit(layout,width,height,height/1080*view.scale);
    ImVec2 origin{std::clamp(view.x*height/1080,0.f,std::max(0.f,width-W*S)),
                  std::clamp(view.y*height/1080,0.f,std::max(0.f,height-H*S))};
    auto* d=ImGui::GetForegroundDrawList();
    auto pos=[&](float x,float y){return ImVec2(origin.x+x*S,origin.y+y*S);};
    auto color=[&](unsigned rgb,float alpha=1.f){
        return IM_COL32((rgb>>16)&255,(rgb>>8)&255,rgb&255,int(255*view.opacity*alpha));
    };
    auto box=[&](float x,float y,float w,float h,unsigned rgb,float radius=0,float alpha=1){
        d->AddRectFilled(pos(x,y),pos(x+w,y+h),color(rgb,alpha),radius*S);
    };
    auto border=[&](float x,float y,float w,float h,unsigned rgb,float radius=0){
        d->AddRect(pos(x,y),pos(x+w,y+h),color(rgb),radius*S,0,S);
    };
    auto fontFor=[&](float size,bool strong=false){
        return size*S<=14?(strong?boldSmall_:normalSmall_):
            size*S>24?(strong?boldLarge_:normalLarge_):(strong?bold_:normal_);
    };
    auto label=[&](float x,float y,float size,unsigned rgb,const std::string& text,
                   float max=10000,bool strong=false){
        auto* f=fontFor(size,strong);
        auto s=ellipsis(f,size,text,max);
        d->AddText(f,size*S,pos(x,y),color(rgb),s.c_str());
    };
    auto center=[&](float x,float y,float w,float h,float size,unsigned rgb,const std::string& value){
        label(x+(w-textWidth(fontFor(size,true),size,value))/2,y+(h-size)/2,size,rgb,value,w,true);
    };
    auto wrapped=[&](float x,float y,float size,float line,unsigned rgb,const std::string& text,
                     float max,bool strong=false,int limit=1000){
        auto* font=fontFor(size,strong);auto lines=wrap(font,size,text,max);
        for(size_t i=0;i<lines.size()&&int(i)<limit;i++){
            auto value=(int(i)==limit-1&&lines.size()>size_t(limit))?ellipsis(font,size,lines[i]+"...",max):lines[i];
            label(x,y,size,rgb,value,max,strong);y+=line;
        }
        return y;
    };
    auto gradient=[&](float x,float y,float w,float h,ImU32 a,ImU32 b,ImU32 c,ImU32 e){
        d->AddRectFilledMultiColor(pos(x,y),pos(x+w,y+h),a,b,c,e);
    };
    auto picture=[&](const std::wstring& file,float x,float y,float w,float h,bool contain){
        auto& image=texture(file);if(!image.view)return false;
        if(contain){float factor=std::min(w/image.width,h/image.height);float iw=image.width*factor,ih=image.height*factor;x+=(w-iw)/2;y+=(h-ih)/2;w=iw;h=ih;}
        d->AddImage(reinterpret_cast<ImTextureID>(image.view),pos(x,y),pos(x+w,y+h),{0,0},{1,1},color(0xffffff));
        return true;
    };
    box(3,5,W,H,0x000000,7,.2f);box(0,0,W,H,0x140d14,7);
    d->PushClipRect(pos(1,3),pos(W-1,H-1),true);
    gradient(1,3,W-2,150,color(0x76162d),color(0x250c1c),color(0x250c1c),color(0x76162d));
    d->PushClipRect(pos(1,3),pos(W-1,153),true);
    auto& figure=texture(L"gentildonna.png");
    if(figure.view)picture(L"gentildonna.png",235,-40,174,174.f*figure.height/figure.width,false);
    gradient(1,3,187,150,color(0x63172c),color(0x591429,.92f),color(0x591429,.92f),color(0x63172c));
    gradient(188,3,152,150,color(0x591429,.92f),color(0x230d21,0),color(0x230d21,0),color(0x591429,.92f));
    gradient(1,86,W-2,67,color(0x140d14,0),color(0x140d14,0),color(0x140d14),color(0x140d14));
    label(16,15,9,0xfba4b8,"TOURNAMENT / LIVE");
    wrapped(16,32,20,22,0xfff2ed,theme.tournament,246,true,2);
    box(12,80,373,23,0x160c13,3,.68f);
    label(18,84,12,0xfff2ed,theme.matchup,361,true);
    float stageWidth=std::min(115.f,std::ceil(textWidth(fontFor(10,true),10,theme.stage))+18);
    box(16,112,stageWidth,20,0x892440,3);border(16,112,stageWidth,20,0xb13755,3);
    label(25,116,10,0xffda9c,theme.stage,stageWidth-18,true);
    label(26+stageWidth,116,10,0xe6c7b5,theme.round,W-stageWidth-42);
    label(16,137,9,race.demo?0xffd66c:0xc8abb4,
          !live?"WAITING FOR A RACE":race.demo?"PREVIEW / SAMPLE DATA":race.paused?"RACE PAUSED":"LIVE POSITION TRACKER",W-32);
    d->PopClipRect();
    box(1,153,W-2,42,0x28121f);box(1,153,W-2,1,0x793146);
    std::string track=live?(race.trackName.empty()?(race.trackId?"Track "+std::to_string(race.trackId):"TRACK TBD"):race.trackName):"TRACK TBD";
    std::string distance=live&&race.course>0?std::to_string(int(std::round(race.course)))+" m":"DISTANCE TBD";
    auto surface=mapped(live?race.groundType:0,{"Turf","Dirt"},"SURFACE TBD");
    float surfaceW=std::ceil(textWidth(fontFor(11,true),11,surface)),distanceW=std::ceil(textWidth(fontFor(11,true),11,distance));
    label(13,160,12,0xfff0e5,track,W-40-surfaceW-distanceW,true);
    label(W-13-surfaceW-distanceW-7,160,11,0xf4d6c9,distance,distanceW,true);
    label(W-13-surfaceW,160,11,0xf4d6c9,surface,surfaceW,true);
    std::string conditions=mapped(live?race.groundCondition:0,{"Firm","Good","Soft","Heavy"},"GOING TBD")+"  |  "+
        mapped(live?race.weather:0,{"Sunny","Cloudy","Rainy","Snowy"},"WEATHER TBD")+"  |  "+
        mapped(live?race.season:0,{"Spring","Summer","Autumn","Winter","Spring (cherry blossoms)"},"SEASON TBD");
    label(13,178,10,0xe0b5c5,conditions,W-26);
    box(1,195,W-2,20,0x28151f);label(15,201,8,0xc598a7,"POS");label(90,201,8,0xc598a7,"UMA / PLAYER");

    if(!live||race_!=race.identity||std::abs(lastRow_-row)>.01f){motion_.clear();race_=race.identity;lastRow_=row;}
    float lead=0;bool finished=live;
    for(size_t i=0;live&&i<race.runners.size();i++){
        const auto& r=race.runners[i];lead=std::max(lead,r.distance);finished=finished&&r.finished;
        float target=headHeight+i*row;
        auto entry=motion_.emplace(r.id,Motion{target,target,target,1,0,r.rank,0});
        advance(entry.first->second,target,r.rank,dt,theme.motion/1000);
    }
    for(auto it=motion_.begin();it!=motion_.end();){
        if(std::none_of(race.runners.begin(),race.runners.end(),[&](auto& r){return r.id==it->first;}))it=motion_.erase(it);else ++it;
    }
    // Paint lower ranks first, then clip each complete card. During an overtake
    // the upper card occludes the lower card's text, just like OBS's z-index.
    d->PushClipRect(pos(1,headHeight),pos(W-1,headHeight+layout.count*row),true);
    for(int i=layout.count-1;i>=0;i--){
        if(!live){
            float y=headHeight+i*row;box(6,y,W-12,row-3,0x21151d,4,.54f);
            border(15,y+(theme.compact?10:13),31,34,0x48303d,5);
            box(theme.compact?56:53,y+11,theme.compact?32:38,theme.compact?32:38,0x30202c,4);
            box(98,y+16,138,7,0x30202c,4);box(98,y+34,78,5,0x30202c,4);continue;
        }
        const auto& r=race.runners[i];const auto& m=motion_.at(r.id);float y=m.y;
        box(6,y,W-12,row-3,r.rank==1?0x54283b:r.rank==2?0x432230:r.rank==3?0x341c27:0x21151d,4);
        d->PushClipRect(pos(6,y),pos(W-6,y+row-3),true);
        if(r.player||std::find(theme.picks.begin(),theme.picks.end(),r.gate)!=theme.picks.end())box(6,y,3,row-3,0xff7897);
        float rankY=y+(theme.compact?10:13);
        bool flash=m.flash>0&&std::fmod(1.4f-m.flash,.55f)>.275f;
        unsigned rankBg=flash?(m.change>0?0xad7720:0xb52b4a):0x291822;
        unsigned rankBorder=flash?(m.change>0?0xffe49e:0xff859b):r.rank==1?0xd78b96:0x764052;
        box(15,rankY,31,34,rankBg,5);border(15,rankY,31,34,rankBorder,5);
        center(15,rankY,31,34,21,r.rank==1?0xffe1b2:0xfff2ed,std::to_string(r.rank));
        float portraitX=theme.compact?56:53,portraitSize=theme.compact?32:38;
        box(portraitX,y+11,portraitSize,portraitSize,0x452739,5);
        if(!r.card||!picture(L"cards\\"+std::to_wstring(r.card)+L".png",portraitX,y+11,portraitSize,portraitSize,true))
            center(portraitX,y+11,portraitSize,portraitSize,13,0xeec5ce,std::to_string(r.gate));
        float nameY=wrapped(96,y+(theme.compact?4:5),theme.compact?13:14,theme.compact?14:16,0xfff2ed,r.name,identityWidth,true);
        if(!r.variant.empty())nameY=wrapped(96,nameY,theme.compact?9.5f:10,theme.compact?11:12,0xd8b3b8,"("+r.variant+")",identityWidth);
        label(96,nameY+(theme.compact?1:2),theme.compact?10:11,0xddbecb,playerName(r),identityWidth);
        constexpr unsigned styleColors[]={0xc1aeb9,0x35aaff,0x45d483,0xffcf45,0xff5968};
        constexpr const char* styles[]={"?","F","P","L","E"};
        int style=std::clamp(r.style,0,4);
        box(280,y+9,20,17,0x1a111a,3);border(280,y+9,20,17,0x79616b,3);
        center(280,y+9,20,17,11,0xead5dc,std::to_string(r.gate));
        box(304,y+9,20,17,0x151018,3);box(304,y+9,20,17,styleColors[style],3,.15f);
        d->AddRect(pos(304,y+9),pos(324,y+26),color(styleColors[style],.65f),3*S,0,S);
        center(304,y+9,20,17,11,styleColors[style],styles[style]);
        char gap[40],speed[40];
        if(r.finished)snprintf(gap,sizeof(gap),"FIN");
        else if(r.rank==1)snprintf(gap,sizeof(gap),"LEADER");
        else snprintf(gap,sizeof(gap),"+%.1fm",std::max(0.f,lead-r.distance));
        snprintf(speed,sizeof(speed),"%.1f",r.speed*3.6f);
        label(387-textWidth(fontFor(10,true),10,gap),y+9,10,r.rank==1?0xffe1ad:0xf1c4be,gap,59,true);
        float unitW=textWidth(fontFor(7),7," km/h");
        label(387-unitW-textWidth(fontFor(10),10,speed),y+23,10,0xc8b0bd,speed,59-unitW);
        label(387-unitW,y+25,7,0xb29aa8," km/h");
        if(theme.indicators){
            auto active=lights(r,race.time);
            for(int j=0;j<4;j++){
                float x=296+j*25,ly=y+41;
                unsigned rgb=active[j]?(j==0?0xffae45:j==2?0xffcf45:0xff5968):0x967f8b;
                float alpha=active[j]?(.66f+.34f*std::cos(clock*6.2831853f/1.1f)):.25f;
                auto ink=color(rgb,alpha);
                auto line=[&](float a,float b,float c,float e){d->AddLine(pos(x+a,ly+b),pos(x+c,ly+e),ink,1.5f*S);};
                auto rect=[&](float a,float b,float w,float h){d->AddRect(pos(x+a,ly+b),pos(x+a+w,ly+b+h),ink,0,0,1.5f*S);};
                if(j==0){const ImVec2 points[]={{8,1},{3,7},{7,7},{6,11},{12,4},{8,4},{9,1}};for(int k=0;k<7;k++)line(points[k].x,points[k].y,points[(k+1)%7].x,points[(k+1)%7].y);}
                else if(j==1){rect(1,3,11,7);rect(12,5,2,3);line(4,5,4,8);}
                else if(j==2){d->AddCircle(pos(x+8,ly+6),4*S,ink,16,1.5f*S);line(8,3,8,6);line(8,6,10,7);line(6,0,10,0);}
                else{rect(2,2,12,8);line(4,3,7,9);line(9,3,12,9);}
            }
        }
        d->PopClipRect();
    }
    d->PopClipRect();
    float footer=headHeight+layout.count*row,progress=live&&race.course>0?std::clamp(lead/race.course,0.f,1.f):0;
    box(6,footer+6,W-12,2,0x56303e);box(6,footer+6,(W-12)*progress,2,0xf23460);
    std::string count=live?std::to_string(layout.count)+" RUNNERS / "+(finished?"FINISH":race.paused?"PAUSED":"RACING"):"GAME CONNECTED";
    std::string remaining=live?(race.course>0?std::to_string(int(std::round(std::max(0.f,race.course-lead))))+"m LEFT":"--"):"READY FOR THE FIELD";
    label(12,footer+15,9,0xbb8b9d,count,W-145);
    label(W-12-textWidth(fontFor(9),9,remaining),footer+15,9,0xecc8a1,remaining,140);
    d->PopClipRect();border(0,0,W,H,0x8d2b43,7);box(1,0,W-2,3,0xf3325f);
}
}
