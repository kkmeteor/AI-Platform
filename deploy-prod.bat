@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - 测试机部署脚本（离线版）
REM 功能：加载镜像 tar 文件并启动服务
REM 适用于：测试机（无源码，使用预构建镜像）
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - 离线部署
echo ============================================
echo.

REM 检查 Docker 是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 未运行，请先启动 Docker Desktop。
    pause
    exit /b 1
)

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 检查 tar 文件是否存在
if not exist "dcloud-market-backend.tar" (
    echo [错误] 未找到 dcloud-market-backend.tar
    echo 请确保所有镜像 tar 文件与本脚本在同一目录下。
    pause
    exit /b 1
)
if not exist "dcloud-market-frontend.tar" (
    echo [错误] 未找到 dcloud-market-frontend.tar
    echo 请确保所有镜像 tar 文件与本脚本在同一目录下。
    pause
    exit /b 1
)

REM 初始化数据目录
echo [信息] 检查数据目录 C:\Data ...
if not exist "C:\Data" (
    echo [信息] 首次部署，创建 C:\Data 目录...
    mkdir "C:\Data"
)
if not exist "C:\Data\uploads" (
    echo [信息] 创建 C:\Data\uploads 目录...
    mkdir "C:\Data\uploads"
)
if not exist "C:\Data\skills.db" (
    echo [信息] 初始化空的 skills.db 文件...
    type nul > "C:\Data\skills.db"
)
echo [成功] 数据目录就绪。
echo.

REM 加载后端镜像
echo [1/2] 加载后端镜像 (dcloud-market-backend.tar)...
docker load -i dcloud-market-backend.tar
if errorlevel 1 (
    echo [错误] 后端镜像加载失败！
    pause
    exit /b 1
)
echo [成功] 后端镜像加载完成。
echo.

REM 加载前端镜像
echo [2/2] 加载前端镜像 (dcloud-market-frontend.tar)...
docker load -i dcloud-market-frontend.tar
if errorlevel 1 (
    echo [错误] 前端镜像加载失败！
    pause
    exit /b 1
)
echo [成功] 前端镜像加载完成。
echo.

REM 停止旧容器
echo [信息] 停止旧容器（如有）...
docker-compose -f docker-compose.prod.yml down
echo.

REM 启动服务
echo [信息] 启动所有服务...
docker-compose -f docker-compose.prod.yml up -d
if errorlevel 1 (
    echo [错误] 服务启动失败！
    echo 请运行以下命令查看详细日志：
    echo   docker-compose -f docker-compose.prod.yml logs
    pause
    exit /b 1
)

echo.
echo [信息] 等待服务就绪...
timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo   部署完成！
echo ============================================
echo.
echo 服务状态：
docker-compose -f docker-compose.prod.yml ps
echo.
echo 访问地址：
echo   前端页面：http://localhost:9090
echo   后端 API：http://localhost:8000
echo   API 文档：http://localhost:8000/docs
echo.
echo 常用命令：
echo   查看日志：docker-compose -f docker-compose.prod.yml logs -f
echo   停止服务：docker-compose -f docker-compose.prod.yml down
echo   重启服务：docker-compose -f docker-compose.prod.yml restart
echo.
pause
