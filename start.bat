@echo off
setlocal EnableExtensions
title Research-to-Document Studio
cd /d "%~dp0"

echo ============================================
echo  Research-to-Document Studio
echo ============================================
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Put start.bat in the project folder and run it again.
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  echo Run setup.bat first, or install Node.js from https://nodejs.org/
  goto :fail
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Running setup...
  echo.
  call "%~dp0setup.bat" /auto
  if errorlevel 1 (
    echo.
    echo ERROR: Setup failed. Fix the error above, then run start.bat again.
    goto :fail
  )
)

echo Starting the local server...
echo The browser opens automatically.
echo Keep this window open while you work.
echo Press Ctrl+C to stop the server.
echo.

node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --open

echo.
echo The server has stopped.
if /I not "%~1"=="/auto" pause
exit /b 0

:fail
echo.
if /I not "%~1"=="/auto" pause
exit /b 1
