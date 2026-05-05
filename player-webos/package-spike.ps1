param(
  [ValidateSet("tv", "signage")]
  [string]$Profile = "tv",
  [string]$Stage = "$env:USERPROFILE\zigns-webos-build",
  [string]$OutDir = $PSScriptRoot,
  [string]$Device = $env:WEBOS_DEVICE,
  [switch]$Install
)

$ErrorActionPreference = "Stop"

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required on PATH to generate package icons."
}

foreach ($command in @("ares-package", "ares-config")) {
  if (!(Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is required on PATH. Install @webos-tools/cli first."
  }
}

if ($Install) {
  foreach ($command in @("ares-install", "ares-launch")) {
    if (!(Get-Command $command -ErrorAction SilentlyContinue)) {
      throw "$command is required on PATH for -Install."
    }
  }

  if ([string]::IsNullOrWhiteSpace($Device)) {
    throw "Pass -Device <device-name> or set WEBOS_DEVICE before using -Install."
  }
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$IconScript = Join-Path $RepoRoot "scripts\generate-player-icons.js"
$SourceDir = Join-Path $RepoRoot "player-webos"

Write-Host "== Generate package icons =="
& node $IconScript

Write-Host "== Set webOS CLI profile: $Profile =="
& ares-config --profile $Profile

Write-Host "== Stage webOS package source =="
Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage | Out-Null
$PackageFiles = @(
  (Join-Path $SourceDir "appinfo.json"),
  (Join-Path $SourceDir "index.html"),
  (Join-Path $SourceDir "icon.png"),
  (Join-Path $SourceDir "largeicon.png")
)
Copy-Item -Path $PackageFiles -Destination $Stage -Force

Write-Host "== Package .ipk =="
Remove-Item (Join-Path $OutDir "io.zigns.player_*.ipk") -Force -ErrorAction SilentlyContinue
& ares-package -o $OutDir $Stage

$Ipk = Get-ChildItem $OutDir -Filter "io.zigns.player_*.ipk" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (!$Ipk) {
  throw "Package completed but no .ipk was found under $OutDir"
}

Write-Host "Built: $($Ipk.FullName)"

if ($Install) {
  Write-Host "== Install on device: $Device =="
  & ares-install -d $Device $Ipk.FullName

  Write-Host "== Launch app =="
  & ares-launch -d $Device "io.zigns.player"
}
