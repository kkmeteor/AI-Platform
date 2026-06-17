@echo off
chcp 65001 >nul
REM ============================================
REM DCloud Market - 镜像导出脚本
REM 功能：将 Docker 镜像导出为 tar 文件，
REM       并打包部署所需的全部文件
REM ============================================

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   DCloud Market - 镜像导出（离线部署包）
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

REM 检查镜像是否存在
echo [信息] 检查镜像...
docker image inspect dcloud-market-backend:latest >nul 2>&1
if errorlevel 1 (
    echo [信息] 后端镜像不存在，先构建...
    docker build -t dcloud-market-backend:latest ./backend
    if errorlevel 1 (
        echo [错误] 后端镜像构建失败！
        pause
        exit /b 1
    )
)

docker image inspect dcloud-market-frontend:latest >nul 2>&1
if errorlevel 1 (
    echo [信息] 前端镜像不存在，先构建...
    docker build -t dcloud-market-frontend:latest ./frontend
    if errorlevel 1 (
        echo [错误] 前端镜像构建失败！
        pause
        exit /b 1
    )
)

echo [成功] 镜像检查通过。
echo.

REM 创建导出目录
set EXPORT_DIR=%~dp0dcloud-market-deploy
if exist "%EXPORT_DIR%" (
    echo [信息] 清理旧的导出目录...
    rmdir /s /q "%EXPORT_DIR%"
)
mkdir "%EXPORT_DIR%"

REM 导出后端镜像
echo [1/2] 导出后端镜像 (dcloud-market-backend.tar)...
docker save -o "%EXPORT_DIR%\dcloud-market-backend.tar" dcloud-market-backend:latest
if errorlevel 1 (
    echo [错误] 后端镜像导出失败！
    pause
    exit /b 1
)
echo [成功] 后端镜像已导出。
echo.

REM 导出前端镜像
echo [2/2] 导出前端镜像 (dcloud-market-frontend.tar)...
docker save -o "%EXPORT_DIR%\dcloud-market-frontend.tar" dcloud-market-frontend:latest
if errorlevel 1 (
    echo [错误] 前端镜像导出失败！
    pause
    exit /b 1
)
echo [成功] 前端镜像已导出。
echo.

REM 复制部署所需文件
echo [信息] 复制部署配置文件...
copy /y "%~dp0docker-compose.prod.yml" "%EXPORT_DIR%\docker-compose.prod.yml" >nul
copy /y "%~dp0deploy-prod.bat" "%EXPORT_DIR%\deploy.bat" >nul
copy /y "%~dp0DEPLOY.md" "%EXPORT_DIR%\DEPLOY.md" >nul
REM 生成测试机专用 stop.bat（使用 prod compose 文件）
(
  echo @echo off
  echo chcp 65001 ^>nul
  echo echo.
  echo echo ============================================
  echo echo   DCloud Market - 停止所有服务
  echo echo ============================================
  echo echo.
  echo cd /d "%%~dp0"
  echo docker-compose -f docker-compose.prod.yml down
  echo echo.
  echo echo [信息] 所有服务已停止。
  echo echo.
  echo pause
) > "%EXPORT_DIR%\stop.bat"

echo.
echo ============================================
echo   导出完成！
echo ============================================
echo.
echo 导出目录：%EXPORT_DIR%
echo.
echo 目录内容：
dir /b "%EXPORT_DIR%"
echo.
echo 请将整个 dcloud-market-deploy 文件夹复制到测试机，
echo 然后在测试机上运行 deploy.bat 即可。
echo.
pause
