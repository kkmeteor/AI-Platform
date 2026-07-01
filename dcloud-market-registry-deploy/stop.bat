@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   DCloud Market - Stop All Services
echo ============================================
echo.
cd /d "%~dp0"
docker-compose -f docker-compose.registry.yml down
echo.
echo [INFO] All services stopped.
echo.
pause
