#include "helper_handoff.h"

int wmain(int argc, wchar_t** argv) {
    if (argc != 3) return 1;
    const auto port = static_cast<unsigned short>(_wtoi(argv[1]));
    if (!port || port == 27840) return 2;
    auto session = WinHttpOpen(L"Helper handoff test", WINHTTP_ACCESS_TYPE_NO_PROXY, nullptr, nullptr, 0);
    auto connection = session ? WinHttpConnect(session, L"127.0.0.1", port, 0) : nullptr;
    if (!connection) return 3;
    nlohmann::json initial;
    if (probe(connection, &initial) != Desk::ready || !idleLegacyDesk(initial)) return 4;
    auto armed = initial;
    armed["armedHeatId"] = "test-heat";
    if (retireLegacyDesk(connection, port, argv[2], armed)) return 5;
    auto stale = initial;
    stale["revision"] = initial["revision"].get<int>() + 1;
    if (retireLegacyDesk(connection, port, argv[2], stale)) return 6;
    if (retireLegacyDesk(connection, port, L"C:\\unrelated\\node.exe", initial)) return 7;
    return retireLegacyDesk(connection, port, argv[2], initial) ? 0 : 8;
}
