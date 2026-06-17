@echo off
chcp 65001 >nul
echo ========================================
echo   Starting Frontend React (Vite)
echo ========================================
cd /d "%~dp0frontend"
npm run dev
pause
