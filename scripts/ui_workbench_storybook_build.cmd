@echo off
setlocal
cd /d "%~dp0.."
if not exist "ui-workbench\node_modules" (
  call npm.cmd --prefix ui-workbench install
  if errorlevel 1 exit /b %errorlevel%
)
call npm.cmd --prefix ui-workbench run build-storybook
