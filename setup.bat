@echo off
REM DaylightLab Setup and Run Script for Windows
REM =============================================

echo.
echo ========================================
echo   DaylightLab - Daylight Analysis Tool
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version and run the installer.
    echo Make sure to check "Add to PATH" during installation.
    echo.
    pause
    exit /b 1
)

REM Display Node.js version
echo [OK] Node.js found:
node --version
echo.

REM Check if npm is available
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not available.
    echo Please reinstall Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    echo This may take a minute on first run...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully.
) else (
    echo [OK] Dependencies already installed.
)

echo.
echo ========================================
echo   Starting DaylightLab...
echo ========================================
echo.
echo The application will open in your default browser.
echo If it doesn't, open: http://localhost:5173
echo.
echo Press Ctrl+C to stop the server.
echo.

REM Start the development server
call npm run dev

pause
