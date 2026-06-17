@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - 停止服务脚本
REM ============================================

echo.
echo ============================================
echo   DCloud Market - 停止所有服务
echo ============================================
echo.

cd /d "%~dp0"

docker-compose down

echo.
echo [信息] 所有服务已停止。
echo.
pause
