param(
  [string]$TizenStudio = "C:\tizen-studio",
  [string]$ProfilesXml = "C:\tizen-studio-data\profile\profiles.xml",
  [string]$Profile = $env:TIZEN_PROFILE,
  [string]$Stage = "$env:USERPROFILE\zigns-tizen-build",
  [string]$Target = $env:TIZEN_TARGET,
  [switch]$Install
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Profile)) {
  $Profile = "zigns-tv-dev"
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$IconScript = Join-Path $RepoRoot "scripts\generate-player-icons.js"
$SourceDir = Join-Path $RepoRoot "player-tizen"
$TizenBat = Join-Path $TizenStudio "tools\ide\bin\tizen.bat"
$SdbExe = Join-Path $TizenStudio "tools\sdb.exe"

if (!(Test-Path $TizenBat)) {
  throw "Tizen CLI not found at $TizenBat"
}

if (!(Test-Path $ProfilesXml)) {
  throw "Tizen profiles.xml not found at $ProfilesXml"
}

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required on PATH to generate package icons."
}

Write-Host "== Generate package icon =="
& node $IconScript

Write-Host "== Stage Tizen package source =="
Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage | Out-Null
$PackageFiles = @(
  (Join-Path $SourceDir "config.xml"),
  (Join-Path $SourceDir "index.html"),
  (Join-Path $SourceDir "icon.png")
)
Copy-Item -Path $PackageFiles -Destination $Stage -Force

Write-Host "== Tizen CLI =="
& $TizenBat version

Write-Host "== Configure signing profile path =="
& $TizenBat cli-config -g "default.profiles.path=$ProfilesXml"

Write-Host "== Security profiles =="
& $TizenBat security-profiles list

Write-Host "== Build web project =="
& $TizenBat build-web -- $Stage

$BuildResult = Join-Path $Stage ".buildResult"

Write-Host "== Package .wgt =="
& $TizenBat package -t wgt -s $Profile -- $BuildResult

$Wgt = Get-ChildItem $BuildResult -Filter "*.wgt" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (!$Wgt) {
  throw "Package completed but no .wgt was found under $BuildResult"
}

Write-Host "Built: $($Wgt.FullName)"

if ($Install) {
  if ([string]::IsNullOrWhiteSpace($Target)) {
    throw "Pass -Target <device-name> or set TIZEN_TARGET before using -Install."
  }

  if (Test-Path $SdbExe) {
    Write-Host "== SDB devices =="
    & $SdbExe devices
  }

  Write-Host "== Install on target: $Target =="
  & $TizenBat install -n $Wgt.FullName -t $Target
}
