#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <winhttp.h>
#include <string>

enum class Desk { ready, unavailable, other };

static Desk probe(HINTERNET connection) {
    HINTERNET request = WinHttpOpenRequest(connection, L"GET", L"/api/ops/state", nullptr,
                                           WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
    if (!request) return Desk::unavailable;
    DWORD policy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    WinHttpSetOption(request, WINHTTP_OPTION_REDIRECT_POLICY, &policy, sizeof(policy));
    Desk result = Desk::unavailable;
    if (WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, nullptr, 0, 0, 0) &&
        WinHttpReceiveResponse(request, nullptr)) {
        DWORD status = 0, size = sizeof(status);
        WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                            WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX);
        if (status != 200) {
            WinHttpCloseHandle(request);
            return status == 503 ? Desk::unavailable : Desk::other;
        }
        char buffer[512];
        std::string prefix;
        DWORD count = 0;
        while (prefix.size() < sizeof(buffer) &&
               WinHttpReadData(request, buffer, sizeof(buffer) - static_cast<DWORD>(prefix.size()), &count) && count) {
            prefix.append(buffer, count);
            if (prefix.find("\"tournament\":") != std::string::npos) break;
        }
        result = prefix.rfind("{\"version\":", 0) == 0 &&
                 prefix.find("\"revision\":") != std::string::npos &&
                 prefix.find("\"tournament\":") != std::string::npos ? Desk::ready : Desk::other;
    }
    WinHttpCloseHandle(request);
    return result;
}

static int fail(const wchar_t* message, bool quiet) {
    if (!quiet) MessageBoxW(nullptr, message, L"DDT2 Tournament Helper", MB_OK | MB_ICONERROR);
    return 1;
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR args, int) {
    const bool quiet = std::wstring(args) == L"--start-only";
    HINTERNET session = WinHttpOpen(L"DDT2 Launcher", WINHTTP_ACCESS_TYPE_NO_PROXY, nullptr, nullptr, 0);
    if (!session) return fail(L"Windows could not check the local desk.", quiet);
    WinHttpSetTimeouts(session, 500, 500, 1500, 2500);
    HINTERNET connection = WinHttpConnect(session, L"127.0.0.1", 27840, 0);
    if (!connection) return fail(L"Windows could not connect to the local desk.", quiet);
    Desk state = probe(connection);
    bool portWasOccupied = false;
    if (state == Desk::unavailable) {
        wchar_t path[32768];
        DWORD length = GetModuleFileNameW(nullptr, path, 32768);
        if (!length || length >= 32768) return fail(L"Windows could not locate the Helper folder.", quiet);
        std::wstring directory(path, length);
        directory.resize(directory.find_last_of(L"\\/"));
        auto node = directory + L"\\node.exe", script = directory + L"\\app.mjs";
        if (GetFileAttributesW(script.c_str()) == INVALID_FILE_ATTRIBUTES)
            return fail(L"The Helper is missing app.mjs. Restore it in the companion folder.", quiet);
        std::wstring command = L"\"" + node + L"\" \"" + script + L"\"";
        STARTUPINFOW startup{}; startup.cb = sizeof(startup);
        PROCESS_INFORMATION child{};
        if (!CreateProcessW(node.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
                            nullptr, directory.c_str(), &startup, &child))
            return fail(L"The Helper could not start node.exe. Check the companion installation.", quiet);
        CloseHandle(child.hThread);
        const auto deadline = GetTickCount64() + 20000;
        do {
            Sleep(200);
            state = probe(connection);
            if (state != Desk::unavailable) break;
            DWORD code = STILL_ACTIVE;
            if (GetExitCodeProcess(child.hProcess, &code) && code != STILL_ACTIVE) {
                if (code == 0) { portWasOccupied = true; continue; }
                CloseHandle(child.hProcess);
                return fail(L"The Helper stopped during startup. Check your tournament data folder and installation.", quiet);
            }
        } while (GetTickCount64() < deadline);
        CloseHandle(child.hProcess);
    }
    WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    if (state == Desk::other) return fail(L"Another service answered on the Helper's local port (27840).", quiet);
    if (state != Desk::ready && portWasOccupied) return fail(L"Port 27840 is already in use, but the running desk did not respond. Close the old Helper instance before reopening this shortcut.", quiet);
    if (state != Desk::ready) return fail(L"The Helper did not answer on this PC within 20 seconds. Reopen the shortcut to try again.", quiet);
    if (!quiet && reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr, L"open", L"http://127.0.0.1:27840/",
                                                          nullptr, nullptr, SW_SHOWNORMAL)) <= 32)
        return fail(L"The Helper is running. Open http://127.0.0.1:27840/ in your Windows browser.", false);
    return 0;
}
