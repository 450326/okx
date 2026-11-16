@echo off
chcp 65001 >nul
title OKX Trading - 构建桌面安装程序

echo ========================================
echo  OKX Trading - Windows 安装程序构建
echo ========================================
echo.

REM 进入项目根目录
cd /d "%~dp0.."

echo [1/7] 安装前端依赖...
cd frontend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 前端依赖安装失败!
    pause
    exit /b 1
)
echo [OK] 前端依赖安装完成
echo.

echo [2/7] 构建前端...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 前端构建失败!
    pause
    exit /b 1
)
echo [OK] 前端构建完成
echo.

echo [3/7] 安装后端依赖...
cd ..\backend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 后端依赖安装失败!
    pause
    exit /b 1
)
echo [OK] 后端依赖安装完成
echo.

echo [4/7] 生成 Prisma 客户端...
call npx prisma generate
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Prisma 客户端生成失败!
    pause
    exit /b 1
)
echo [OK] Prisma 客户端生成完成

call npx prisma db push
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 数据库初始化失败!
    pause
    exit /b 1
)
echo [OK] 数据库初始化完成
echo.

echo [5/7] 构建后端...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 后端构建失败!
    pause
    exit /b 1
)
echo [OK] 后端构建完成
echo.

echo [6/7] 安装 Electron 打包工具...
cd ..\desktop
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Electron 依赖安装失败!
    pause
    exit /b 1
)
echo [OK] Electron 依赖安装完成
echo.

echo [7/7] 构建 Windows 安装程序...
call npm run prepare-runtime || exit /b 1
call npx electron-builder --win
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 安装程序构建失败!
    pause
    exit /b 1
)
echo [OK] 安装程序构建完成!
echo.

echo ========================================
echo  构建完成!
echo  安装程序位于: desktop\release\
echo  文件名: OKX Trading Setup *.exe
echo ========================================
echo.
pause
