$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

$env:UHS_BRIDGE_SHARED_SECRET = "uhs-bridge-local-20260319"

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "npm.cmd not found. Install Node.js for Windows first." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $electronExe)) {
  Write-Host "Windows Electron runtime missing. Running npm install..." -ForegroundColor Yellow
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
  }
}

Write-Host "Refreshing latest app build before launch..." -ForegroundColor Yellow
& npm.cmd run app:electron
if ($LASTEXITCODE -ne 0) {
  Write-Host "App launch failed." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit $LASTEXITCODE
}
