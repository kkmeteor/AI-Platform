@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Deploy Script
REM Purpose: Start all services using docker-compose
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - One-Click Deploy
echo ============================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Switch to project root directory
cd /d "%~dp0"

REM Initialize data directory (create and migrate data on first deployment)
echo [INFO] Checking data directory C:\Data ...
if not exist "C:\Data" (
    echo [INFO] First deployment, creating C:\Data directory...
    mkdir "C:\Data"
)
if not exist "C:\Data\uploads" (
    echo [INFO] Creating C:\Data\uploads directory...
    mkdir "C:\Data\uploads"
)
REM Create empty skills.db if not present, so Docker mounts it as a file not a directory
if not exist "C:\Data\skills.db" (
    echo [INFO] Initializing empty skills.db file...
    type nul > "C:\Data\skills.db"
)
REM Initialize config directory and config.json, so Docker mounts it as a file not a directory
if not exist "C:\Data\config" (
    echo [INFO] Creating C:\Data\config directory...
    mkdir "C:\Data\config"
)
REM Docker creates a directory instead of a file when the bind-mount source is missing;
REM replace any directory left at config.json path with a real config file
if exist "C:\Data\config\config.json\" (
    echo [WARN] C:\Data\config\config.json is a directory, replacing with file...
    rmdir /s /q "C:\Data\config\config.json"
)
if not exist "C:\Data\config\config.json" (
    echo [INFO] Initializing config.json file...
    if exist "config\config.json" (
        copy /y "config\config.json" "C:\Data\config\config.json" >nul
    ) else (
        type nul > "C:\Data\config\config.json"
    )
)
echo [OK] Config directory ready.
REM On first deployment, copy existing upload files from backend to C:\Data\uploads
if exist "backend\uploads" (
    dir /b "backend\uploads\*.zip" >nul 2>&1
    if not errorlevel 1 (
        if not exist "C:\Data\uploads\*.zip" (
            echo [INFO] First deployment, copying existing upload files to C:\Data\uploads ...
            xcopy /y /q "backend\uploads\*.zip" "C:\Data\uploads\" >nul
        )
    )
)
echo [OK] Data directory ready.
echo.

echo [INFO] Checking existing containers...
docker-compose ps
echo.

echo [INFO] Stopping old containers (if any)...
docker-compose down
echo.

echo [INFO] Building and starting all services...
docker-compose up -d --build
if errorlevel 1 (
    echo [ERROR] Service startup failed!
    echo Run the following command to view detailed logs:
    echo   docker-compose logs
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
docker-compose ps
echo.
echo Access URLs:
echo   Frontend:  http://localhost:9090
echo   Backend API: http://localhost:8000
echo   API Docs:    http://localhost:8000/docs
echo.
echo Common commands:
echo   View logs:    docker-compose logs -f
echo   Stop services: docker-compose down
echo   Restart:       docker-compose restart
echo.
pause
