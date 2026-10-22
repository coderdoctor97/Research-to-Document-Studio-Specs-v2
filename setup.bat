@echo off
setlocal EnableExtensions
title Research-to-Document Studio - Setup
cd /d "%~dp0"

set "AUTO=0"
if /I "%~1"=="/auto" set "AUTO=1"

echo ============================================
echo  Research-to-Document Studio - Setup
echo ============================================
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Put setup.bat in the project folder and run it again.
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  echo.
  echo Install Node.js 22 LTS from:
  echo   https://nodejs.org/
  echo Then run setup.bat again.
  goto :fail
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  echo Reinstall Node.js and make sure npm is included.
  goto :fail
)

echo Node.js version:
node --version
echo npm version:
call npm --version
echo.

node -e "const v=process.versions.node.split('.').map(Number); const ok=v[0]>22||(v[0]===22&&v[1]>=12)||(v[0]===20&&v[1]>=19); if(!ok){console.error('ERROR: Node.js 20.19+ or 22.12+ is required. Found '+process.version); process.exit(1)}"
if errorlevel 1 goto :fail

echo Installing dependencies...
echo This can take a few minutes on the first run.
echo.
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  echo Check your internet connection and the messages above, then try again.
  goto :fail
)

echo.
echo Setup complete.
echo Double-click start.bat to open the studio.
if "%AUTO%"=="0" pause
exit /b 0

:fail
echo.
echo Setup did not finish.
if "%AUTO%"=="0" pause
exit /b 1
