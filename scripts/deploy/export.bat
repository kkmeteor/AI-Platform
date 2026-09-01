@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Image Export Script
REM Purpose: Export Docker images to tar files
REM          and package all deployment files
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - Image Export (Offline Deploy Package)
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

REM Check if images exist
echo [INFO] Checking images...
docker image inspect dcloud-market-backend:latest >nul 2>&1
if errorlevel 1 (
    echo [INFO] Backend image not found, building...
    docker build -t dcloud-market-backend:latest ../backend
    if errorlevel 1 (
        echo [ERROR] Backend image build failed!
        pause
        exit /b 1
    )
)

docker image inspect dcloud-market-frontend:latest >nul 2>&1
if errorlevel 1 (
    echo [INFO] Frontend image not found, building...
    docker build -t dcloud-market-frontend:latest ../frontend
    if errorlevel 1 (
        echo [ERROR] Frontend image build failed!
        pause
        exit /b 1
    )
)

echo [OK] Image check passed.
echo.

REM Create export directory (kept at project root, see .gitignore)
set EXPORT_DIR=%~dp0..\..\dcloud-market-deploy
if exist "%EXPORT_DIR%" (
    echo [INFO] Cleaning old export directory...
    rmdir /s /q "%EXPORT_DIR%"
)
mkdir "%EXPORT_DIR%"

REM Export backend image
echo [1/2] Exporting backend image (dcloud-market-backend.tar)...
docker save -o "%EXPORT_DIR%\dcloud-market-backend.tar" dcloud-market-backend:latest
if errorlevel 1 (
    echo [ERROR] Backend image export failed!
    pause
    exit /b 1
)
echo [OK] Backend image exported.
echo.

REM Export frontend image
echo [2/2] Exporting frontend image (dcloud-market-frontend.tar)...
docker save -o "%EXPORT_DIR%\dcloud-market-frontend.tar" dcloud-market-frontend:latest
if errorlevel 1 (
    echo [ERROR] Frontend image export failed!
    pause
    exit /b 1
)
echo [OK] Frontend image exported.
echo.

REM Copy deployment files
echo [INFO] Copying deployment config files...
copy /y "%~dp0docker-compose.prod.yml" "%EXPORT_DIR%\docker-compose.prod.yml" >nul
copy /y "%~dp0deploy-prod.bat" "%EXPORT_DIR%\deploy.bat" >nul
copy /y "%~dp0DEPLOY.md" "%EXPORT_DIR%\DEPLOY.md" >nul

REM Generate test-machine stop.bat (using prod compose file)
echo @echo off> "%EXPORT_DIR%\stop.bat"
echo chcp 65001 ^>nul>> "%EXPORT_DIR%\stop.bat"
echo echo.>> "%EXPORT_DIR%\stop.bat"
echo echo ============================================>> "%EXPORT_DIR%\stop.bat"
echo echo   DCloud Market - Stop All Services>> "%EXPORT_DIR%\stop.bat"
echo echo ============================================>> "%EXPORT_DIR%\stop.bat"
echo echo.>> "%EXPORT_DIR%\stop.bat"
echo cd /d "%%~dp0">> "%EXPORT_DIR%\stop.bat"
echo docker-compose -f docker-compose.prod.yml down>> "%EXPORT_DIR%\stop.bat"
echo echo.>> "%EXPORT_DIR%\stop.bat"
echo echo [INFO] All services stopped.>> "%EXPORT_DIR%\stop.bat"
echo echo.>> "%EXPORT_DIR%\stop.bat"
echo pause>> "%EXPORT_DIR%\stop.bat"

echo.
echo ============================================
echo   Export completed!
echo ============================================
echo.
echo Export directory: %EXPORT_DIR%
echo.
echo Directory contents:
dir /b "%EXPORT_DIR%"
echo.
echo Copy the entire dcloud-market-deploy folder to the test machine,
echo then run deploy.bat on the test machine.
echo.
pause
