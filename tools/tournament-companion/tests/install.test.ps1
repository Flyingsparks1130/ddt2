$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $project 'version.txt') -Raw).Trim()
$package = Join-Path $project "dist/Dominator-Tournament-$version-win64"
$temp = Join-Path ([IO.Path]::GetTempPath()) ('dominator-install-test-' + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path (Join-Path $temp 'hachimi'),(Join-Path $temp 'DominatorNetwork') -Force
foreach ($name in @('UmamusumePrettyDerby.exe','cri_mana_vpx.dll','horseACT.dll','horseACTConfig.json','hachimi/config.json','DominatorNetwork/obs-settings.json','DominatorNetwork/game-preview.json')) {
    'PRESERVE THIS FIXTURE' | Set-Content -LiteralPath (Join-Path $temp $name)
}
# Use a valid preserved configuration so the installed desk can start.
'{"tournament":"Installer test"}' | Set-Content -LiteralPath (Join-Path $temp 'DominatorNetwork/obs-settings.json') -Encoding ascii
$protected = @('cri_mana_vpx.dll','horseACT.dll','horseACTConfig.json','hachimi/config.json','DominatorNetwork/obs-settings.json','DominatorNetwork/game-preview.json')
$before = @{}
foreach ($name in $protected) { $before[$name] = (Get-FileHash -LiteralPath (Join-Path $temp $name)).Hash }
& (Join-Path $package 'Install.ps1') -GameDirectory $temp -CheckOnly
if (Test-Path -LiteralPath (Join-Path $temp 'DominatorNetwork.dll')) { throw 'Preflight wrote files' }
& (Join-Path $package 'Install.ps1') -GameDirectory $temp
foreach ($name in $protected) {
    if ((Get-FileHash -LiteralPath (Join-Path $temp $name)).Hash -ne $before[$name]) { throw "Installer altered $name" }
}
if ((Get-FileHash -LiteralPath (Join-Path $temp 'DominatorNetwork.dll')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $package 'DominatorNetwork.dll')).Hash) { throw 'Plugin was not installed' }
# Exercise an in-place upgrade using the installed runtime and a private tournament directory.
$companion = Join-Path $temp 'DominatorNetwork/companion'
$runtime = Join-Path $companion 'node.exe'
$data = Join-Path $temp 'operator data'
$socket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$socket.Start()
$port = $socket.LocalEndpoint.Port
$socket.Stop()
$stateUrl = "http://127.0.0.1:$port/api/ops/state"
$arguments = @('app.mjs','--port',"$port",'--bridge-port','0','--event','ddt2','--data',('"' + $data + '"'))
function Start-TestDesk {
    $child = Start-Process -FilePath $runtime -WorkingDirectory $companion -ArgumentList $arguments -WindowStyle Hidden -PassThru
    try {
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            if ($child.HasExited) { throw 'The installed test desk exited at startup.' }
            try { if ((Invoke-RestMethod $stateUrl -TimeoutSec 1).version) { return $child } } catch {}
            Start-Sleep -Milliseconds 150
        }
        throw 'The installed test desk did not start.'
    } catch {
        if (-not $child.HasExited) { $child.Kill(); $child.WaitForExit() }
        throw
    }
}
$desk = Start-TestDesk
try {
    $stateFile = Join-Path $data 'tournament.json'
    $saved = (Get-FileHash $stateFile).Hash
    & (Join-Path $package 'Install.ps1') -GameDirectory $temp -CheckOnly
    if ($desk.HasExited) { throw 'Preflight stopped the running Helper.' }
    & (Join-Path $package 'Install.ps1') -GameDirectory $temp
    if (-not $desk.HasExited) { throw 'Installer left its old Helper running.' }
    if ((Get-FileHash $stateFile).Hash -ne $saved) { throw 'Upgrade altered saved tournament data.' }
    $desk = Start-TestDesk
    $state = Invoke-RestMethod $stateUrl
    if ($state.version -ne $version -or $state.matches.Count -ne 4) { throw 'The updated Helper did not reopen with four matchups.' }
} finally {
    if (-not $desk.HasExited) { $desk.Kill(); $desk.WaitForExit() }
}
Write-Output 'Verified automatic close, saved tournament data and four matchups after relaunch.'
# A modified payload is rejected before any copy.
$payload = Join-Path $package 'README.txt'
$original = [IO.File]::ReadAllBytes($payload)
try {
    [IO.File]::AppendAllText($payload, 'tampered')
    $rejected = $false
    try { & (Join-Path $package 'Install.ps1') -GameDirectory $temp -CheckOnly } catch { $rejected = $_.Exception.Message -like '*verification failed*' }
    if (-not $rejected) { throw 'Modified package was accepted' }
} finally { [IO.File]::WriteAllBytes($payload, $original) }
Write-Output 'Installer passed: preflight, clean installation, settings/dependency preservation, and modified-package rejection.'
