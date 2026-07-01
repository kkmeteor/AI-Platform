@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Registry Push Script
REM Purpose: Build and push Docker images
REM          to internal registry
REM ============================================

setlocal enabledelayedexpansion

REM Internal registry address (no trailing slash)
set REGISTRY=10.10.11.194:1000

echo.
echo ============================================
echo   DCloud Market - Push to Internal Registry
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

REM Check if registry is reachable
echo [INFO] Checking registry connectivity...
docker pull %REGISTRY%/dcloud-market-backend:ping >nul 2>&1
REM Pull will fail, but we check the error type later via push
echo [OK] Docker is running.
echo.

REM Switch to project root directory
cd /d "%~dp0"

REM Check and build backend image
echo [INFO] Checking backend image...
docker image inspect dcloud-market-backend:latest >nul 2>&1
if errorlevel 1 (
    echo [INFO] Backend image not found, building...
    docker build -t dcloud-market-backend:latest ./backend
    if errorlevel 1 (
        echo [ERROR] Backend image build failed!
        pause
        exit /b 1
    )
)

REM Check and build frontend image
echo [INFO] Checking frontend image...
docker image inspect dcloud-market-frontend:latest >nul 2>&1
if errorlevel 1 (
    echo [INFO] Frontend image not found, building...
    docker build -t dcloud-market-frontend:latest ./frontend
    if errorlevel 1 (
        echo [ERROR] Frontend image build failed!
        pause
        exit /b 1
    )
)

echo [OK] All local images ready.
echo.

REM ============================================
REM Tag images with registry prefix
REM ============================================
echo [INFO] Tagging images for registry...

docker tag dcloud-market-backend:latest %REGISTRY%/dcloud-market-backend:latest
if errorlevel 1 (
    echo [ERROR] Failed to tag backend image!
    pause
    exit /b 1
)

docker tag dcloud-market-frontend:latest %REGISTRY%/dcloud-market-frontend:latest
if errorlevel 1 (
    echo [ERROR] Failed to tag frontend image!
    pause
    exit /b 1
)

echo [OK] Images tagged.
echo   - %REGISTRY%/dcloud-market-backend:latest
echo   - %REGISTRY%/dcloud-market-frontend:latest
echo.

REM ============================================
REM Push backend image
REM ============================================
echo [1/2] Pushing backend image...
docker push %REGISTRY%/dcloud-market-backend:latest
if errorlevel 1 (
    echo [ERROR] Backend image push failed!
    echo [HINT] Check if registry %REGISTRY% is reachable.
    echo [HINT] You may need to add it to insecure-registries in Docker Desktop settings.
    pause
    exit /b 1
)
echo [OK] Backend image pushed.
echo.

REM ============================================
REM Push frontend image
REM ============================================
echo [2/2] Pushing frontend image...
docker push %REGISTRY%/dcloud-market-frontend:latest
if errorlevel 1 (
    echo [ERROR] Frontend image push failed!
    echo [HINT] Check if registry %REGISTRY% is reachable.
    echo [HINT] You may need to add it to insecure-registries in Docker Desktop settings.
    pause
    exit /b 1
)
echo [OK] Frontend image pushed.
echo.

REM ============================================
REM Package deploy files for target machine
REM ============================================
set DEPLOY_DIR=%~dp0dcloud-market-registry-deploy
if exist "%DEPLOY_DIR%" (
    echo [INFO] Cleaning old deploy directory...
    rmdir /s /q "%DEPLOY_DIR%"
)
mkdir "%DEPLOY_DIR%"

echo [INFO] Copying deploy files...
copy /y "%~dp0docker-compose.registry.yml" "%DEPLOY_DIR%\docker-compose.registry.yml" >nul
copy /y "%~dp0deploy-registry.bat" "%DEPLOY_DIR%\deploy.bat" >nul

REM Copy config directory (config.json for runtime override)
mkdir "%DEPLOY_DIR%\config"
copy /y "%~dp0config\config.json" "%DEPLOY_DIR%\config\config.json" >nul

REM Generate stop.bat for target machine
echo @echo off> "%DEPLOY_DIR%\stop.bat"
echo chcp 65001 ^>nul>> "%DEPLOY_DIR%\stop.bat"
echo echo.>> "%DEPLOY_DIR%\stop.bat"
echo echo ============================================>> "%DEPLOY_DIR%\stop.bat"
echo echo   DCloud Market - Stop All Services>> "%DEPLOY_DIR%\stop.bat"
echo echo ============================================>> "%DEPLOY_DIR%\stop.bat"
echo echo.>> "%DEPLOY_DIR%\stop.bat"
echo cd /d "%%~dp0">> "%DEPLOY_DIR%\stop.bat"
echo docker-compose -f docker-compose.registry.yml down>> "%DEPLOY_DIR%\stop.bat"
echo echo.>> "%DEPLOY_DIR%\stop.bat"
echo echo [INFO] All services stopped.>> "%DEPLOY_DIR%\stop.bat"
echo echo.>> "%DEPLOY_DIR%\stop.bat"
echo pause>> "%DEPLOY_DIR%\stop.bat"

echo [OK] Deploy files packaged.
echo.

REM ============================================
REM Summary
REM ============================================
echo ============================================
echo   Push and export completed!
echo ============================================
echo.
echo Images in registry:
echo   - %REGISTRY%/dcloud-market-backend:latest
echo   - %REGISTRY%/dcloud-market-frontend:latest
echo.
echo Deploy directory: %DEPLOY_DIR%
echo.
echo Directory contents:
dir /b "%DEPLOY_DIR%"
echo.
echo Copy the entire dcloud-market-registry-deploy folder to the target machine,
echo then run deploy.bat on the target machine.
echo.
pause
