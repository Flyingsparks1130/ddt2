#pragma once
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <iphlpapi.h>
#include "json.hpp"
#include <vector>
#include <shellapi.h>
#include <winhttp.h>
#include <string>

enum class Desk { ready, unavailable, other };

static Desk probe(HINTERNET connection, nlohmann::json* details = nullptr) {
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
        std::string body;
        char buffer[4096];
        DWORD count = 0;
        while (body.size() <= 8 * 1024 * 1024 &&
               WinHttpReadData(request, buffer, sizeof(buffer), &count) && count) {
            body.append(buffer, count);
            if (!details && body.find("\"tournament\":") != std::string::npos) break;
        }
        if (body.rfind("{\"version\":", 0) == 0 &&
            body.find("\"revision\":") != std::string::npos &&
            body.find("\"tournament\":") != std::string::npos) {
            result = Desk::ready;
            if (details) {
                *details = nlohmann::json::parse(body, nullptr, false);
                if (!details->is_object()) result = Desk::other;
            }
        } else result = Desk::other;
    }
    WinHttpCloseHandle(request);
    return result;
}

// 0.6.2 predates update handoff. Only retire the idle listener from this installation.
static DWORD listenerOwner(unsigned short port) {
    DWORD bytes = 0;
    if (GetExtendedTcpTable(nullptr, &bytes, FALSE, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0)
        != ERROR_INSUFFICIENT_BUFFER) return 0;
    std::vector<unsigned char> buffer(bytes);
    auto* table = reinterpret_cast<MIB_TCPTABLE_OWNER_PID*>(buffer.data());
    if (GetExtendedTcpTable(table, &bytes, FALSE, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0)
        != NO_ERROR) return 0;
    for (DWORD i = 0; i < table->dwNumEntries; ++i) {
        const auto& row = table->table[i];
        if (row.dwLocalAddr == htonl(INADDR_LOOPBACK) && ntohs(static_cast<u_short>(row.dwLocalPort)) == port)
            return row.dwOwningPid;
    }
    return 0;
}

static bool idleLegacyDesk(const nlohmann::json& state) {
    return state.is_object() && state.contains("version") && state["version"] == "0.6.2" &&
           state.contains("activeHeatId") && state["activeHeatId"].is_null() &&
           state.contains("armedHeatId") && state["armedHeatId"].is_null() &&
           state.contains("bridge") && state["bridge"].is_object() &&
           state["bridge"].contains("active") && state["bridge"]["active"] == false &&
           state.contains("revision") && state["revision"].is_number_integer();
}

static bool retireLegacyDesk(HINTERNET connection, unsigned short port,
                             const std::wstring& node, const nlohmann::json& initial) {
    if (!idleLegacyDesk(initial)) return false;
    const DWORD pid = listenerOwner(port);
    if (!pid) return false;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE |
                                 SYNCHRONIZE, FALSE, pid);
    if (!process) return false;
    wchar_t image[32768];
    DWORD length = sizeof(image) / sizeof(*image);
    nlohmann::json latest;
    bool retired = QueryFullProcessImageNameW(process, 0, image, &length) &&
                   _wcsicmp(image, node.c_str()) == 0 &&
                   probe(connection, &latest) == Desk::ready && idleLegacyDesk(latest) &&
                   latest["revision"] == initial["revision"] && listenerOwner(port) == pid &&
                   TerminateProcess(process, 0) && WaitForSingleObject(process, 5000) == WAIT_OBJECT_0;
    CloseHandle(process);
    return retired;
}

