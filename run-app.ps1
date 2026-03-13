$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

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

$rendererIndex = Join-Path $PSScriptRoot "dist-app\renderer\index.html"
$mainEntry = Join-Path $PSScriptRoot "dist-app\main\main.js"
if ((-not (Test-Path -LiteralPath $rendererIndex)) -or (-not (Test-Path -LiteralPath $mainEntry))) {
  Write-Host "App build output missing. Running full app build..." -ForegroundColor Yellow
  & npm.cmd --prefix app run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Full app build failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
  }
}

Set-Location -LiteralPath (Join-Path $PSScriptRoot "app")
& npm.cmd start
if ($LASTEXITCODE -ne 0) {
  Write-Host "App launch failed." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit $LASTEXITCODE
}
