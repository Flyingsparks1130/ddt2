#include "dominator.h"
#include <cstdio>
std::mutex stateMutex;
RaceSnapshot raceState;
Settings settings;
std::wstring baseDir;
static HMODULE ownModule;
static void* (*domainGet)();
static void* (*threadCurrent)();
static void* (*threadAttach)(void*);
static void (*threadDetach)(void*);
static void launchCompanion(){
    auto directory=baseDir+L"\\companion";
    auto executable=directory+L"\\node.exe";
    auto script=directory+L"\\app.mjs";
    if(GetFileAttributesW(executable.c_str())==INVALID_FILE_ATTRIBUTES||GetFileAttributesW(script.c_str())==INVALID_FILE_ATTRIBUTES){logLine("Tournament companion is missing; run the companion installer.");return;}
    std::wstring command=L"\""+executable+L"\" \""+script+L"\"";
    STARTUPINFOW startup{};startup.cb=sizeof(startup);startup.dwFlags=STARTF_USESHOWWINDOW;startup.wShowWindow=SW_HIDE;
    PROCESS_INFORMATION process{};
    if(CreateProcessW(executable.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,directory.c_str(),&startup,&process)){CloseHandle(process.hThread);CloseHandle(process.hProcess);}
    else logLine("Tournament companion could not start: Windows error "+std::to_string(GetLastError()));
}
void logLine(const std::string& message){
    OutputDebugStringA(("Dominator OBS: "+message+"\n").c_str());
    if(auto file=_wfopen((baseDir+L"\\dominator-obs.log").c_str(),L"a")){fprintf(file,"%llu %s\n",GetTickCount64(),message.c_str());fclose(file);}
}
static void present(void* swap,void*){
    // The optional independent preview uses the existing registered callback.
    // A permanently attached worker can prevent IL2CPP shutdown from completing.
    // Scheduling creates a managed delegate, so attach only when needed and
    // release our attachment immediately. poll still runs on Unity's main thread.
    void* attached=nullptr;
    if(!threadCurrent()){auto domain=domainGet();attached=domain?threadAttach(domain):nullptr;if(!attached)return;}
    scheduleTelemetry();
    if(attached)threadDetach(attached);
    drawGamePreview(swap);
}
extern "C" __declspec(dllexport) int hachimi_init_v3(GetApi api,int version){
    if(!api||version<3)return 0;
    wchar_t path[32768];GetModuleFileNameW(ownModule,path,32768);baseDir=path;
    baseDir=baseDir.substr(0,baseDir.find_last_of(L"\\/"))+L"\\DominatorNetwork";
    CreateDirectoryW(baseDir.c_str(),nullptr);
    logLine("Dominator OBS 0.6.3 initializing; read-only telemetry, DDT2 operations and optional game preview.");
    auto resolve=reinterpret_cast<void*(*)(const char*)>(api("il2cpp_resolve_symbol"));
    if(!resolve)return 0;
    domainGet=reinterpret_cast<decltype(domainGet)>(resolve("il2cpp_domain_get"));
    threadCurrent=reinterpret_cast<decltype(threadCurrent)>(resolve("il2cpp_thread_current"));
    threadAttach=reinterpret_cast<decltype(threadAttach)>(resolve("il2cpp_thread_attach"));
    threadDetach=reinterpret_cast<decltype(threadDetach)>(resolve("il2cpp_thread_detach"));
    if(!domainGet||!threadCurrent||!threadAttach||!threadDetach){logLine("IL2CPP thread registration unavailable.");return 0;}
    if(!initTelemetry(api)||!startServer(27845)){logLine("Initialization failed; check API availability and bridge port 27845.");return 0;}
    using Register=bool(*)(void(*)(void*,void*),void*);
    auto reg=reinterpret_cast<Register>(api("hachimi_register_present_callback"));
    if(!reg||!reg(present,nullptr)){logLine("Frame callback unavailable.");stopServer();return 0;}
    if(!registerGamePreview(api))logLine("Hachimi preview menu unavailable; browser preview controls remain available.");
    launchCompanion();
    logLine("Ready. Operations: http://127.0.0.1:27840/  OBS: http://127.0.0.1:27840/overlay  Internal bridge: 27845");
    return 1;
}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){ownModule=module;DisableThreadLibraryCalls(module);}return TRUE;}
