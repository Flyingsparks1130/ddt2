# Tournament companion

Windows x64 Hachimi API v3 plugin and standalone operator desk for DDT2. The organizer distributes the Windows ZIP privately to designated operators. Public release downloads and build artifacts are withdrawn; the source remains public. See [README.txt](README.txt) for installation and [TOURNAMENT-GUIDE.txt](TOURNAMENT-GUIDE.txt) for operations.

The original race overlay is retained. Matchup and series-score sources use the DDT2 artwork. Approval is required separately for heats, manual corrections, series outcomes and public result commits. Hachimi and horseACT are external prerequisites and are not included or edited by the installer.

## Build

Use LLVM-MinGW `20261006` x64 UCRT and the official Node.js `24.19.0` Windows x64 executable. The Windows workflow verifies both downloads by SHA-256, builds the independent DLL/launcher, runs tests and packages only the allowlisted runtime files. `package.ps1` generates a per-file manifest; `Install.ps1` verifies it before writing and preserves existing settings.

```powershell
./build-clang.ps1 -Clang C:/toolchains/llvm-mingw-20261006-ucrt-x86_64/bin/clang++.exe
./TelemetryTest.exe
node --test tests/companion.test.mjs tests/ddt2-series.test.mjs tests/companion-bridge.test.mjs
node tests/web-0.4.2.mjs
node tests/race-info-stamina.mjs
./package.ps1 -NodeRuntime C:/downloads/node.exe
```

Tests use temporary stores and synthetic fixtures; no tournament results are bundled. A local Windows build produces `dist/Dominator-Tournament-0.6.0-win64.zip` and `SHA256SUMS.txt` for private distribution. CI validates the package but does not upload artifacts or publish releases. Downloading the public source does not provide GitHub publishing credentials.

Native rendering compiles and the HTTP bridge has automated coverage. Visual compatibility of the optional in-game preview must be checked against the recipient's Hachimi/game build; it is disabled by default.
