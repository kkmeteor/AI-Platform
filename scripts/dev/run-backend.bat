@echo off
cd /d "%~dp0backend"

REM 真实 Python 路径优先于 WindowsApps 占位桩
set "PATH=%LOCALAPPDATA%\Python\bin;%PATH%"

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
