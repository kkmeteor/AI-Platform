@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

echo ========================================
echo   Starting All Projects...
echo ========================================
echo.

echo [1/3] Starting Backend (FastAPI)...
start "Backend - FastAPI" cmd /k "cd /d "%ROOT%backend" & python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo [2/3] Starting Frontend React (Vite)...
start "Frontend - React" cmd /k "cd /d "%ROOT%frontend" & call npm run dev"

echo [3/3] Starting Frontend Angular...
start "Frontend - Angular" cmd /k "cd /d "%ROOT%frontend_angular" & call npm start"

echo.
echo ========================================
echo   All 3 projects started!
echo   Backend:          http://localhost:8000
echo   Frontend React:   http://localhost:5173
echo   Frontend Angular: http://localhost:4200
echo ========================================
endlocal
pause
