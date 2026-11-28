#include "helper_handoff.h"

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
    nlohmann::json initial;
    Desk state = probe(connection);
    bool portWasOccupied = false;
    wchar_t path[32768];
    DWORD length = GetModuleFileNameW(nullptr, path, 32768);
    if (!length || length >= 32768) return fail(L"Windows could not locate the Helper folder.", quiet);
    std::wstring directory(path, length);
    directory.resize(directory.find_last_of(L"\\/"));
    auto node = directory + L"\\node.exe", script = directory + L"\\app.mjs";
    if (GetFileAttributesW(script.c_str()) == INVALID_FILE_ATTRIBUTES)
        return fail(L"The Helper is missing app.mjs. Restore it in the companion folder.", quiet);
    bool switching = false;
    if (!quiet && state == Desk::ready && probe(connection, &initial) == Desk::ready && previousHelper(initial)) {
        if (idleLegacyDesk(initial)) {
            int choice = MessageBoxW(nullptr, L"Helper 0.6.13 is installed. The Race Desk is still running an earlier version.\n\n"
                                      L"Save any unfinished edits before switching. Switch to 0.6.13 now?",
                                      L"Update Tournament Helper", MB_YESNO | MB_ICONQUESTION);
            if (choice == IDYES) {
                if (!retireLegacyDesk(connection, 27840, node, initial))
                    return fail(L"The desk changed or Windows could not verify its process. Open the shortcut again when the desk is idle.", quiet);
                switching = true;
                state = Desk::unavailable;
            }
        } else {
            MessageBoxW(nullptr, L"The current race desk is in use. Open the shortcut after the session to switch versions.",
                        L"Tournament Helper", MB_OK | MB_ICONINFORMATION);
        }
    }
    if (state == Desk::unavailable) {
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
    if (switching) {
        nlohmann::json loaded;
        if (state != Desk::ready || probe(connection, &loaded) != Desk::ready ||
            loaded["version"] != "0.6.13")
            return fail(L"Windows did not confirm Helper 0.6.13. Reopen the shortcut to check again.", quiet);
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
