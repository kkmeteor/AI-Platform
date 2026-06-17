@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - 一键打包脚本
REM 功能：构建 Docker 镜像（前端 + 后端）
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - Docker 镜像打包
echo ============================================
echo.

REM 检查 Docker 是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 未运行，请先启动 Docker Desktop。
    echo 提示：启动 Docker Desktop 后等待右下角鲸鱼图标稳定再运行此脚本。
    pause
    exit /b 1
)

echo [信息] Docker 运行正常，开始构建镜像...
echo.

REM 切换到项目根目录
cd /d "%~dp0"

echo [1/2] 构建后端镜像 (dcloud-market-backend)...
docker build -t dcloud-market-backend:latest ./backend
if errorlevel 1 (
    echo [错误] 后端镜像构建失败！
    pause
    exit /b 1
)
echo [成功] 后端镜像构建完成。
echo.

echo [2/2] 构建前端镜像 (dcloud-market-frontend)...
docker build -t dcloud-market-frontend:latest ./frontend
if errorlevel 1 (
    echo [错误] 前端镜像构建失败！
    pause
    exit /b 1
)
echo [成功] 前端镜像构建完成。
echo.

echo ============================================
echo   所有镜像构建完成！
echo ============================================
echo.
echo 镜像列表：
docker images dcloud-market-*
echo.
echo 下一步：运行 deploy.bat 启动服务
echo.
pause
