@echo off
title Minecraft Bedrock Server Manager

echo.
echo ====================================
echo   Minecraft Bedrock Server Manager
echo ====================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [ERROR] Dependencies not installed!
    echo.
    echo Please run: npm install
    echo.
    pause
    exit
)

REM Check if styles.css exists
if not exist "src\styles.css" (
    echo [WARNING] CSS not built yet!
    echo Building CSS now...
    echo.
    call npm run build-css
    echo.
)

echo Starting application...
echo.
npm start