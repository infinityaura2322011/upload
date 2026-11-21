@echo off
setlocal
cd /d "%~dp0"
set "NODE_BIN=%~dp0.node\node-v20.14.0-win-x64"
if exist "%NODE_BIN%\node.exe" (
  set "PATH=%NODE_BIN%;%PATH%"
)

echo Freeing port 4319...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4319') do (
  taskkill /f /pid %%a >nul 2>&1
)

echo Building backend...
if exist "%NODE_BIN%\npm.cmd" (
  call "%NODE_BIN%\npm.cmd" run build:backend
) else (
  call npm run build:backend
)
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo Copying schema...
if not exist dist\db mkdir dist\db
copy /y src\db\schema.sql dist\db\schema.sql >nul

echo Launching Coding Monster...
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if exist "%ELECTRON_EXE%" (
  start "" "%ELECTRON_EXE%" .
) else (
  call npm start
)
endlocal
