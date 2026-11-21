@echo off
setlocal enabledelayedexpansion
title Coding Monster
cd /d "%~dp0"

echo.
echo  ======================================================
echo   CODING MONSTER - Autonomous AI Engineering Center
echo  ======================================================
echo.

REM 1. Detect Node.js (portable bundled first)
set "NODE_CMD="
if exist "%~dp0.node\node-v20.14.0-win-x64\node.exe" (
    set "NODE_CMD=%~dp0.node\node-v20.14.0-win-x64\node.exe"
    set "PATH=%~dp0.node\node-v20.14.0-win-x64;%PATH%"
    echo [OK] Using bundled Node.js
) else (
    where node >nul 2>&1
    if !ERRORLEVEL! == 0 (
        set "NODE_CMD=node"
        echo [OK] Using system Node.js
    )
)

if "%NODE_CMD%"=="" (
    echo [ERROR] Node.js not found. Place portable Node in .node\ or install system Node.
    pause
    exit /b 1
)

REM 2. Always rebuild backend (picks up latest changes)
echo [INFO] Building backend...
call "%NODE_CMD%" "%~dp0node_modules\typescript\bin\tsc" --project "%~dp0tsconfig.json"
if !ERRORLEVEL! neq 0 (
    echo [ERROR] Backend build failed.
    pause
    exit /b 1
)

REM 3. Always rebuild Electron shell
echo [INFO] Building Electron shell...
call "%NODE_CMD%" "%~dp0node_modules\typescript\bin\tsc" --project "%~dp0tsconfig.electron.json"
if !ERRORLEVEL! neq 0 (
    echo [ERROR] Electron build failed.
    pause
    exit /b 1
)

REM 4. Sync schema.sql to dist
if not exist "%~dp0dist\db" mkdir "%~dp0dist\db"
if exist "%~dp0src\db\schema.sql" (
    copy /y "%~dp0src\db\schema.sql" "%~dp0dist\db\schema.sql" >nul
    echo [OK] schema.sql synced
)

REM 5. Kill any stale backend on port 4319
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4319 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

REM 6. Launch Electron (it will spawn the backend internally)
echo [INFO] Launching desktop app...
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if exist "!ELECTRON_EXE!" (
    start "" "!ELECTRON_EXE!" "%~dp0."
    echo [OK] App launched. Window should appear in a few seconds.
) else (
    echo [ERROR] Electron not found at !ELECTRON_EXE!
    echo Run: npm install
    pause
    exit /b 1
)

endlocal
