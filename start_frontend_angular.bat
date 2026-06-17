@echo off
chcp 65001 >nul
echo ========================================
echo   Starting Frontend Angular
echo ========================================
cd /d "%~dp0frontend_angular"
npm start
pause
