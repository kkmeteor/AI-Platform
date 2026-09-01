@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Registry Deploy Script
REM Purpose: Pull images from internal registry
REM          and start all services
REM For: Target machines with registry access
REM ============================================

setlocal enabledelayedexpansion

REM Internal registry address (must match export-registry.bat)
set REGISTRY=10.10.11.194:1000

echo.
echo ============================================
echo   DCloud Market - Registry Deployment
echo ============================================
echo   Registry: %REGISTRY%
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

REM Check if compose file exists
if not exist "docker-compose.registry.yml" (
    echo [ERROR] docker-compose.registry.yml not found.
    echo Please ensure this file is in the same directory as this script.
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

REM Pull backend image
echo [1/2] Pulling backend image from registry...
docker pull %REGISTRY%/dcloud-market-backend:latest
if errorlevel 1 (
    echo [ERROR] Backend image pull failed!
    echo [HINT] Check if registry %REGISTRY% is reachable.
    echo [HINT] You may need to add it to insecure-registries in Docker settings.
    pause
    exit /b 1
)
echo [OK] Backend image pulled.
echo.

REM Pull frontend image
echo [2/2] Pulling frontend image from registry...
docker pull %REGISTRY%/dcloud-market-frontend:latest
if errorlevel 1 (
    echo [ERROR] Frontend image pull failed!
    echo [HINT] Check if registry %REGISTRY% is reachable.
    echo [HINT] You may need to add it to insecure-registries in Docker settings.
    pause
    exit /b 1
)
echo [OK] Frontend image pulled.
echo.

REM Stop old containers
echo [INFO] Stopping old containers (if any)...
docker-compose -f docker-compose.registry.yml down
echo.

REM Start services
echo [INFO] Starting all services...
docker-compose -f docker-compose.registry.yml up -d
if errorlevel 1 (
    echo [ERROR] Service startup failed!
    echo Run the following command to view detailed logs:
    echo   docker-compose -f docker-compose.registry.yml logs
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
docker-compose -f docker-compose.registry.yml ps
echo.
echo Access URLs:
echo   Frontend:    http://localhost:9090
echo   Backend API: http://localhost:8000
echo   API Docs:    http://localhost:8000/docs
echo.
echo Common commands:
echo   View logs:     docker-compose -f docker-compose.registry.yml logs -f
echo   Stop services: docker-compose -f docker-compose.registry.yml down
echo   Restart:       docker-compose -f docker-compose.registry.yml restart
echo.
pause
