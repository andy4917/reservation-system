@echo off
setlocal

pushd "\\wsl.localhost\Ubuntu-22.04\home\dev\repos\reservation-system"
if errorlevel 1 (
  echo Failed to open reservation-system workspace from Windows.
  pause
  exit /b 1
)

powershell.exe -NoLogo -ExecutionPolicy Bypass -File ".\run-app.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

popd
exit /b %EXIT_CODE%
