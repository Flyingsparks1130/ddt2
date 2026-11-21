param([Parameter(Mandatory=$true)][string]$Clang)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskFlags=@('--target=x86_64-w64-windows-gnu','-std=c++17','-O2','-static','-DUNICODE','-D_UNICODE','-I',"$taskRoot\vendor",'-I',"$taskRoot\vendor\imgui")
& $Clang @taskFlags -shared "$taskRoot\src\plugin.cpp" "$taskRoot\src\telemetry.cpp" "$taskRoot\src\server.cpp" "$taskRoot\src\game_preview.cpp" "$taskRoot\src\preview_scene.cpp" "$taskRoot\vendor\imgui\imgui.cpp" "$taskRoot\vendor\imgui\imgui_draw.cpp" "$taskRoot\vendor\imgui\imgui_widgets.cpp" "$taskRoot\vendor\imgui\imgui_tables.cpp" "$taskRoot\vendor\imgui\backends\imgui_impl_dx11.cpp" -lws2_32 -ld3d11 -ldxgi -ld3dcompiler -lwindowscodecs -lole32 -luuid -o "$taskRoot\DominatorNetwork.dll"
if($LASTEXITCODE -ne 0){throw 'OBS bridge build failed'}
& $Clang @taskFlags "$taskRoot\src\telemetry_test.cpp" -o "$taskRoot\TelemetryTest.exe"
if($LASTEXITCODE -ne 0){throw 'Telemetry test build failed'}
& $Clang @taskFlags -municode "$taskRoot\src\server_test_host.cpp" "$taskRoot\src\server.cpp" -lws2_32 -o "$taskRoot\ServerTest.exe"
if($LASTEXITCODE -ne 0){throw 'Server test build failed'}
& $Clang @taskFlags -municode -mwindows "$taskRoot\src\companion_launcher.cpp" -lshell32 -o "$taskRoot\DominatorNetwork\companion\Start Tournament Companion.exe"
if($LASTEXITCODE -ne 0){throw 'Companion launcher build failed'}
& $Clang @taskFlags -municode "$taskRoot\src\preview_test.cpp" "$taskRoot\src\preview_scene.cpp" "$taskRoot\vendor\imgui\imgui.cpp" "$taskRoot\vendor\imgui\imgui_draw.cpp" "$taskRoot\vendor\imgui\imgui_widgets.cpp" "$taskRoot\vendor\imgui\imgui_tables.cpp" "$taskRoot\vendor\imgui\backends\imgui_impl_dx11.cpp" -ld3d11 -ldxgi -ld3dcompiler -lwindowscodecs -lole32 -luuid -o "$taskRoot\PreviewTest.exe"
if($LASTEXITCODE -ne 0){throw 'Off-screen preview test build failed'}
Write-Output 'OBS bridge, companion launcher and tests built.'
