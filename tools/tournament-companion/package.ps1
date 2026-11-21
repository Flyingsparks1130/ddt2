param([Parameter(Mandatory=$true)][string]$NodeRuntime, [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.txt') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
if ((Get-FileHash -LiteralPath $NodeRuntime -Algorithm SHA256).Hash -ne '3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237') { throw 'Expected the verified Node.js 24.19.0 Windows x64 runtime' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
$package = Join-Path $output "Dominator-Tournament-$version-win64"
if (Test-Path -LiteralPath $package) { throw "Output already exists: $package. Choose a new output directory." }
$null = New-Item -ItemType Directory -Path $package -Force
foreach ($name in @('DominatorNetwork.dll', 'Install.ps1', 'Install.cmd', 'README.txt', 'TOURNAMENT-GUIDE.txt', 'CREDITS.txt', 'JSON-LICENSE.txt', 'LLVM-MINGW-LICENSE.txt')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $package $name)
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'vendor/imgui/LICENSE.txt') -Destination (Join-Path $package 'IMGUI-LICENSE.txt')
$runtime = Join-Path $package 'DominatorNetwork'
$null = New-Item -ItemType Directory -Path (Join-Path $runtime 'companion') -Force
foreach ($name in @('web', 'assets')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "DominatorNetwork/$name") -Destination $runtime -Recurse
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'DominatorNetwork/obs-settings.json') -Destination $runtime
foreach ($name in @('app.mjs','broadcast.mjs','ddt2.mjs','ddt2-seed.json','domain.mjs','github.mjs','series.mjs','store.mjs','NODE-LICENSE.txt','Start Tournament Companion.exe')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "DominatorNetwork/companion/$name") -Destination (Join-Path $runtime 'companion')
}
Copy-Item -LiteralPath $NodeRuntime -Destination (Join-Path $runtime 'companion/node.exe')
$manifest = foreach ($file in Get-ChildItem -LiteralPath $package -File -Recurse) {
    [ordered]@{ path = $file.FullName.Substring($package.Length + 1).Replace('\','/'); sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
[ordered]@{ version = $version; files = @($manifest) } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $package 'package-manifest.json') -Encoding UTF8
$archive = "$package.zip"
Compress-Archive -Path (Join-Path $package '*') -DestinationPath $archive -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ascii
Write-Output "Created $archive"
