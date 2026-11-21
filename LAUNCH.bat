@echo off
setlocal enabledelayedexpansion
title Coding Monster Launcher
color 0A
cd /d "%~dp0"

echo.
echo  ==========================================
echo   CODING MONSTER - Engineering Command Center
echo  ==========================================
echo.

REM 1. Prefer the user's installed Node runtime on D:\tulshi
if exist "D:\tulshi\node-v24.18.0-win-x64\node.exe" (
    echo [OK] Node.js found in D:\tulshi
    set "PATH=D:\tulshi\node-v24.18.0-win-x64;%PATH%"
    goto :run_npm
)

REM 2. Try portable node inside repository next
if exist "%~dp0.node\node-v20.14.0-win-x64\node.exe" (
    echo [OK] Portable Node.js found
    set "PATH=%~dp0.node\node-v20.14.0-win-x64;%PATH%"
    goto :run_npm
)

REM 3. Try system Node
where node >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] Node.js found on PATH
    goto :run_npm
)

REM 4. Try AppData Node
if exist "C:\Users\user\AppData\Local\ms-playwright-go\1.57.0\node.exe" (
    echo [OK] Node.js runtime found in AppData
    set "PATH=C:\Users\user\AppData\Local\ms-playwright-go\1.57.0;%PATH%"
    goto :run_npm
)

REM 4. Fall back to Python launcher if available
where python >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [INFO] Node.js not found - using Python launcher...
    python "%~dp0launch.py"
    goto :end
)

if exist "D:\Python311\python.exe" (
    echo [INFO] Using D:\Python311\python.exe
    "D:\Python311\python.exe" "%~dp0launch.py"
    goto :end
)

echo [ERROR] Neither Node.js nor Python found.
echo Please install Node.js from https://nodejs.org
pause
goto :end

:run_npm
echo [INFO] Installing dependencies if needed...
if not exist "node_modules" (
    call npm install
)

echo [INFO] Building backend...
call npm run build:backend
if not exist "dist\db" mkdir "dist\db"
copy /y "src\db\schema.sql" "dist\db\schema.sql" >nul

echo [INFO] Launching Coding Monster...
call npm start

:end
endlocal
