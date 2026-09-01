@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

echo ========================================
echo   Starting All Projects...
echo ========================================
echo.

echo [1/2] Starting Backend (FastAPI)...
start "Backend - FastAPI" cmd /k "%ROOT%run-backend.bat"

echo [2/2] Starting Frontend (Vite)...
start "Frontend - React" cmd /k "%ROOT%run-frontend.bat"

echo.
echo ========================================
echo   All 2 projects started!
echo   Backend:   http://localhost:8000
echo   Frontend:  http://localhost:5173
echo ========================================
endlocal
pause
