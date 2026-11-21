#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <string>
int WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int){
    wchar_t buffer[32768];if(!GetModuleFileNameW(nullptr,buffer,32768))return 1;
    std::wstring directory=buffer;directory=directory.substr(0,directory.find_last_of(L"\\/"));
    auto executable=directory+L"\\node.exe";auto script=directory+L"\\app.mjs";
    std::wstring command=L"\""+executable+L"\" \""+script+L"\"";
    STARTUPINFOW startup{};startup.cb=sizeof(startup);startup.dwFlags=STARTF_USESHOWWINDOW;startup.wShowWindow=SW_HIDE;PROCESS_INFORMATION process{};
    if(!CreateProcessW(executable.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,directory.c_str(),&startup,&process)){MessageBoxW(nullptr,L"The tournament companion could not start. Check that node.exe and app.mjs are beside this launcher.",L"Dominator Tournament",MB_OK|MB_ICONERROR);return 1;}
    CloseHandle(process.hThread);CloseHandle(process.hProcess);Sleep(600);
    ShellExecuteW(nullptr,L"open",L"http://127.0.0.1:27840/",nullptr,nullptr,SW_SHOWNORMAL);return 0;
}
