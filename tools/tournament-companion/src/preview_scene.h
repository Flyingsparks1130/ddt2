#pragma once
#include "dominator.h"
#include "imgui.h"
#include <d3d11.h>
#include <unordered_map>

// Native counterpart of web/overlay.css and web/model.js. No hooks, windows,
// network calls or game writes: the scene only draws a supplied race snapshot.
namespace preview {
struct View { float x=16,y=100,scale=1,opacity=1; };
struct Theme {
    std::string tournament="DOMINATOR NETWORK",matchup="MATCHUP TBD",stage="TBD",round="ROUND TBD";
    bool compact=false,indicators=true;
    float motion=320;
    std::vector<int> picks;
};
struct Layout { int count; float row,height; };
struct Motion { float y=0,from=0,to=0,elapsed=1,flash=0; int rank=0,change=0; };
void advance(Motion& motion,float target,int rank,float dt,float duration);
std::array<bool,4> lights(const Runner& runner,float time);
float fit(const Layout& layout,float width,float height,float scale);

class Scene {
public:
    void initialize(ID3D11Device* device,const std::wstring& assetRoot);
    void shutdown();
    Layout measure(const RaceSnapshot& race,bool compact) const;
    void draw(const RaceSnapshot& race,float width,float height,float dt,
              const View& view,const Theme& theme,float clock);
private:
    struct Texture { ID3D11ShaderResourceView* view=nullptr; UINT width=0,height=0; };
    Texture& texture(const std::wstring& relative);
    ID3D11Device* device_=nullptr;
    std::wstring assets_;
    ImFont* normal_=nullptr;
    ImFont* bold_=nullptr;
    ImFont* normalSmall_=nullptr;
    ImFont* boldSmall_=nullptr;
    ImFont* normalLarge_=nullptr;
    ImFont* boldLarge_=nullptr;
    std::unordered_map<std::wstring,Texture> textures_;
    std::unordered_map<int,Motion> motion_;
    uintptr_t race_=0;
    int lastCount_=18;
    float lastRow_=0;
};
}
