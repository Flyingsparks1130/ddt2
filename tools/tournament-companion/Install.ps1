param([string]$GameDirectory, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
if (-not $GameDirectory) { $GameDirectory = (Read-Host 'Paste the Steam folder containing UmamusumePrettyDerby.exe').Trim('"') }
$target = (Resolve-Path -LiteralPath $GameDirectory).Path.TrimEnd('\','/')
if (-not (Test-Path -LiteralPath (Join-Path $target 'UmamusumePrettyDerby.exe') -PathType Leaf)) { throw 'Choose the game folder containing UmamusumePrettyDerby.exe.' }
if ($target -eq $PSScriptRoot.TrimEnd('\','/')) { throw 'Extract the download outside the game folder before installing.' }
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package-manifest.json') -Raw | ConvertFrom-Json
$items = @()
foreach ($entry in $manifest.files) {
    $relative = [string]$entry.path
    if ($relative -notmatch '^(DominatorNetwork\.dll|DominatorNetwork/(web|assets|companion)/[^:]+|DominatorNetwork/obs-settings\.json|Install\.(ps1|cmd)|README\.txt|TOURNAMENT-GUIDE\.txt|CREDITS\.txt|(JSON|LLVM-MINGW|IMGUI)-LICENSE\.txt)$' -or $relative -match '(^|/)\.\.(/|$)|\\') { throw "Unexpected package path: $relative" }
    $source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $relative))
    $destination = [IO.Path]::GetFullPath((Join-Path $target $relative))
    if (-not $source.StartsWith($PSScriptRoot.TrimEnd('\','/') + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $destination.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Package path escaped its root.' }
    # Refuse junctions/symlinks along either path before any installation write.
    foreach ($pathToCheck in @($source, $destination)) {
        $current = $pathToCheck
        while ($current) {
            if (Test-Path -LiteralPath $current) {
                if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked paths are not supported: $current" }
            }
            $parent = Split-Path -Parent $current
            if ($parent -eq $current) { break }
            $current = $parent
        }
    }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Package verification failed: $relative" }
    $items += [pscustomobject]@{Relative=$relative; Source=$source; Destination=$destination}
}
foreach ($required in @('DominatorNetwork.dll','DominatorNetwork/companion/node.exe','DominatorNetwork/companion/app.mjs','DominatorNetwork/web/overlay.html')) {
    if ($required -notin $items.Relative) { throw "Package is incomplete: $required" }
}
if ($CheckOnly) { Write-Output "Verified package $($manifest.version). No files changed."; exit 0 }
if (Get-Process -Name UmamusumePrettyDerby -ErrorAction SilentlyContinue) { throw 'Close Umamusume before installing.' }
# Hold a process handle while verifying the listener so PID reuse cannot target another process.
function Close-InstalledHelper([string]$runtime) {
    $running = @(Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $runtime })
    if (-not $running.Count) { return }
    if ($running.Count -ne 1) { throw 'Multiple processes are using the Helper runtime. Finish the current session and retry.' }
    $desk = $running[0]
    try {
        if ($desk.HasExited) { return }
        $null = $desk.Handle
        $listener = @(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -OwningProcess $desk.Id -ErrorAction SilentlyContinue)
        if ($listener.Count -ne 1) { throw 'The Helper is starting or its listener could not be verified. Wait a moment and run Install.cmd again.' }
        $url = 'http://127.0.0.1:' + $listener[0].LocalPort + '/api/ops/state'
        $previousRevision = $null
        foreach ($check in 1..2) {
            $state = Invoke-RestMethod -Uri $url -TimeoutSec 5 -MaximumRedirection 0
            if (-not $state.version -or $null -eq $state.revision -or -not $state.tournament -or
                $state.PSObject.Properties.Name -notcontains 'armedHeatId' -or $state.bridge.active -ne $false) {
                throw 'The Race Desk is active or could not be verified. Finish the race and retry.'
            }
            if ($null -ne $state.armedHeatId) { throw 'Cancel capture in Race Desk, then run Install.cmd again.' }
            if ($check -eq 2 -and $state.revision -ne $previousRevision) { throw 'The Race Desk is saving changes. Run Install.cmd again when it is idle.' }
            $previousRevision = $state.revision
        }
        if (-not $desk.HasExited) {
            $desk.Kill()
            if (-not $desk.WaitForExit(5000)) { throw 'The Helper is still closing. Wait a moment and run Install.cmd again.' }
        }
        Write-Output 'Closed the running Tournament Helper.'
    } finally {
        $desk.Dispose()
    }
}
Close-InstalledHelper (Join-Path $target 'DominatorNetwork/companion/node.exe')
foreach ($item in $items) {
    if ($item.Relative -ne 'DominatorNetwork.dll' -and -not $item.Relative.StartsWith('DominatorNetwork/')) { continue }
    if ($item.Relative -eq 'DominatorNetwork/obs-settings.json' -and (Test-Path -LiteralPath $item.Destination)) { continue }
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $item.Destination) -Force
    Copy-Item -LiteralPath $item.Source -Destination $item.Destination -Force
}
Write-Output "Installed Dominator Tournament $($manifest.version). Hachimi and horseACT files/settings were not changed."
Write-Output 'Start DominatorNetwork\companion\Start Tournament Companion.exe, then open http://127.0.0.1:27840/.'
Write-Output 'For live in-game data, Hachimi must already be configured to load DominatorNetwork.dll. See README.txt for a first installation.'
