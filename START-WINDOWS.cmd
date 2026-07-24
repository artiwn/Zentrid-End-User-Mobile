@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)
echo Starting Zentrid End User Mobile...
call npm.cmd start
