@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - Stop Services Script
REM ============================================

echo.
echo ============================================
echo   DCloud Market - Stop All Services
echo ============================================
echo.

cd /d "%~dp0"

docker-compose down

echo.
echo [INFO] All services stopped.
echo.
pause
