@echo off
chcp 65001 >nul
echo ========================================
echo   Starting Backend (FastAPI + Uvicorn)
echo ========================================
cd /d "%~dp0backend"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
pause
