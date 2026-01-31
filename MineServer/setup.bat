@echo off
title Minecraft Bedrock Server Manager - Setup

echo.
echo ====================================
echo   First Time Setup
echo ====================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    echo After installing, restart your computer and run this script again.
    echo.
    pause
    exit
)

echo [OK] Node.js found
echo.

REM Install dependencies
echo Installing dependencies...
echo This may take a few minutes...
echo.
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to install dependencies!
    echo.
    echo Try running this as Administrator or check your internet connection.
    echo.
    pause
    exit
)

echo.
echo [OK] Dependencies installed
echo.

REM Build CSS
echo Building Tailwind CSS...
echo.
call npm run build-css

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to build CSS!
    echo.
    pause
    exit
)

echo.
echo [OK] CSS built successfully
echo.

echo ====================================
echo   Setup Complete!
echo ====================================
echo.
echo You can now run the app by:
echo.
echo   1. Double-clicking run.bat
echo   2. Or typing: npm start
echo.
echo Press any key to launch the app now...
pause >nul

call npm start