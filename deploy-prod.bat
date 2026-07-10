@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Test Machine Deploy Script (Offline)
REM Purpose: Load image tar files and start services
REM For: Test machines (no source code, uses pre-built images)
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - Offline Deployment
echo ============================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Switch to script directory
cd /d "%~dp0"

REM Check if tar files exist
if not exist "dcloud-market-backend.tar" (
    echo [ERROR] dcloud-market-backend.tar not found.
    echo Please ensure all image tar files are in the same directory as this script.
    pause
    exit /b 1
)
if not exist "dcloud-market-frontend.tar" (
    echo [ERROR] dcloud-market-frontend.tar not found.
    echo Please ensure all image tar files are in the same directory as this script.
    pause
    exit /b 1
)

REM Initialize data directory
echo [INFO] Checking data directory C:\Data ...
if not exist "C:\Data" (
    echo [INFO] First deployment, creating C:\Data directory...
    mkdir "C:\Data"
)
if not exist "C:\Data\uploads" (
    echo [INFO] Creating C:\Data\uploads directory...
    mkdir "C:\Data\uploads"
)
if not exist "C:\Data\skills.db" (
    echo [INFO] Initializing empty skills.db file...
    type nul > "C:\Data\skills.db"
)
echo [OK] Data directory ready.
echo.

REM Load backend image
echo [1/2] Loading backend image (dcloud-market-backend.tar)...
docker load -i dcloud-market-backend.tar
if errorlevel 1 (
    echo [ERROR] Backend image load failed!
    pause
    exit /b 1
)
echo [OK] Backend image loaded.
echo.

REM Load frontend image
echo [2/2] Loading frontend image (dcloud-market-frontend.tar)...
docker load -i dcloud-market-frontend.tar
if errorlevel 1 (
    echo [ERROR] Frontend image load failed!
    pause
    exit /b 1
)
echo [OK] Frontend image loaded.
echo.

REM Stop old containers
echo [INFO] Stopping old containers (if any)...
docker-compose -f docker-compose.prod.yml down
echo.

REM Start services
echo [INFO] Starting all services...
docker-compose -f docker-compose.prod.yml up -d
if errorlevel 1 (
    echo [ERROR] Service startup failed!
    echo Run the following command to view detailed logs:
    echo   docker-compose -f docker-compose.prod.yml logs
    pause
    exit /b 1
)

echo.
echo [INFO] Waiting for services to be ready...
timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo   Deployment completed!
echo ============================================
echo.
echo Service status:
docker-compose -f docker-compose.prod.yml ps
echo.
echo Access URLs:
echo   Frontend:  http://localhost:9090
echo   Backend API: http://localhost:8000
echo   API Docs:    http://localhost:8000/docs
echo.
echo Common commands:
echo   View logs:    docker-compose -f docker-compose.prod.yml logs -f
echo   Stop services: docker-compose -f docker-compose.prod.yml down
echo   Restart:       docker-compose -f docker-compose.prod.yml restart
echo.
pause
