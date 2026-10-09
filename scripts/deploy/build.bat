@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Build Script
REM Purpose: Build Docker images (frontend + backend)
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - Docker Image Build
echo ============================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    echo TIP: After starting Docker Desktop, wait until the whale icon stabilizes before running this script.
    pause
    exit /b 1
)

echo [INFO] Docker is running, starting image build...
echo.

REM Switch to project root directory
cd /d "%~dp0"

echo [1/2] Building backend image (dcloud-market-backend)...
docker build -t dcloud-market-backend:latest ../../backend
if errorlevel 1 (
    echo [ERROR] Backend image build failed!
    pause
    exit /b 1
)
echo [OK] Backend image built successfully.
echo.

echo [2/2] Building frontend image (dcloud-market-frontend)...
docker build -t dcloud-market-frontend:latest ../../frontend
if errorlevel 1 (
    echo [ERROR] Frontend image build failed!
    pause
    exit /b 1
)
echo [OK] Frontend image built successfully.
echo.

echo ============================================
echo   All images built successfully!
echo ============================================
echo.
echo Image list:
docker images dcloud-market-*
echo.
echo Next step: Run start-docker.bat to start services.
echo.
pause
