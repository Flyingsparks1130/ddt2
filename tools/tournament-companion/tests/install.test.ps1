$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $project 'version.txt') -Raw).Trim()
$package = Join-Path $project "dist/Dominator-Tournament-$version-win64"
$temp = Join-Path ([IO.Path]::GetTempPath()) ('dominator-install-test-' + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path (Join-Path $temp 'hachimi'),(Join-Path $temp 'DominatorNetwork') -Force
foreach ($name in @('UmamusumePrettyDerby.exe','cri_mana_vpx.dll','horseACT.dll','horseACTConfig.json','hachimi/config.json','DominatorNetwork/obs-settings.json','DominatorNetwork/game-preview.json')) {
    'PRESERVE THIS FIXTURE' | Set-Content -LiteralPath (Join-Path $temp $name)
}
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
