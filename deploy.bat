@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - 一键部署脚本
REM 功能：使用 docker-compose 启动所有服务
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - 一键部署
echo ============================================
echo.

REM 检查 Docker 是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 未运行，请先启动 Docker Desktop。
    pause
    exit /b 1
)

REM 切换到项目根目录
cd /d "%~dp0"

REM 初始化数据目录（首次部署时自动创建并迁移已有数据）
echo [信息] 检查数据目录 C:\Data ...
if not exist "C:\Data" (
    echo [信息] 首次部署，创建 C:\Data 目录...
    mkdir "C:\Data"
)
if not exist "C:\Data\uploads" (
    echo [信息] 创建 C:\Data\uploads 目录...
    mkdir "C:\Data\uploads"
)
REM 如果宿主机没有 skills.db，创建空文件以便 Docker 挂载为文件而非目录
if not exist "C:\Data\skills.db" (
    echo [信息] 初始化空的 skills.db 文件...
    type nul > "C:\Data\skills.db"
)
REM 首次部署时，将项目内的 uploads 文件复制到 C:\Data\uploads
if exist "backend\uploads" (
    dir /b "backend\uploads\*.zip" >nul 2>&1
    if not errorlevel 1 (
        if not exist "C:\Data\uploads\*.zip" (
            echo [信息] 首次部署，复制已有上传文件到 C:\Data\uploads ...
            xcopy /y /q "backend\uploads\*.zip" "C:\Data\uploads\" >nul
        )
    )
)
echo [成功] 数据目录就绪。
echo.

echo [信息] 检查现有容器...
docker-compose ps
echo.

echo [信息] 停止旧容器（如有）...
docker-compose down
echo.

echo [信息] 构建并启动所有服务...
docker-compose up -d --build
if errorlevel 1 (
    echo [错误] 服务启动失败！
    echo 请运行以下命令查看详细日志：
    echo   docker-compose logs
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
docker-compose ps
echo.
echo 访问地址：
echo   前端页面：http://localhost:9090
echo   后端 API：http://localhost:8000
echo   API 文档：http://localhost:8000/docs
echo.
echo 常用命令：
echo   查看日志：docker-compose logs -f
echo   停止服务：docker-compose down
echo   重启服务：docker-compose restart
echo.
pause
