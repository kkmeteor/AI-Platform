@echo off
REM 从 scripts/dev 上溯两级到项目根目录
cd /d "%~dp0..\..\frontend"
if not exist "node_modules" call npm install
call npm run dev
