@echo off
chcp 65001 >nul
title OKX Trading - 发布新版本

echo ========================================
echo  OKX Trading - 发布新版本
echo ========================================
echo.
echo  版本将自动增加 0.01
echo  当前版本: 
type "%~dp0package.json" | findstr "version"
echo.
echo  请确保已设置 GH_TOKEN 环境变量!
echo  否则发布到 GitHub 会失败
echo.
echo  设置方法: set GH_TOKEN=你的GitHubToken
echo  获取地址: https://github.com/settings/tokens
echo.
set GH_TOKEN_OK=0
if NOT "%GH_TOKEN%"=="" (
    echo  ✓ GH_TOKEN 已设置
    set GH_TOKEN_OK=1
) else (
    echo  ✗ GH_TOKEN 未设置! 发布将跳过上传步骤
)
echo.

pause
echo.

cd /d "%~dp0.."

echo [1/5] 版本号自增...
cd desktop
call npm run version:bump
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 版本号更新失败!
    pause
    exit /b 1
)
echo.

echo [2/5] 构建前端...
cd ..\frontend
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 前端构建失败!
    pause
    exit /b 1
)
echo [OK] 前端构建完成
echo.

echo [3/5] 构建后端...
cd ..\backend
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 后端构建失败!
    pause
    exit /b 1
)
echo [OK] 后端构建完成
echo.

echo [4/5] 安装依赖...
cd ..\desktop
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 依赖安装失败!
    pause
    exit /b 1
)
echo.

echo [5/5] 构建安装程序并发布到 GitHub...
if "%GH_TOKEN%"=="" (
    echo [WARN] GH_TOKEN 未设置，仅本地构建，不上传
    call npx electron-builder --win --x64
) else (
    echo [INFO] 正在发布到 GitHub Releases...
    call npx electron-builder --win --x64 -p always
)

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 构建失败!
    pause
    exit /b 1
)
echo.

echo ========================================
echo  发布完成!
echo.
echo  下一步操作:
echo  1. 将版本号提交到 Git:
echo     git add desktop/package.json
echo     git commit -m "bump version to X.XX"
echo     git push origin main
echo.
echo  2. 安装程序位置:
echo     desktop\release\OKX Trading Setup *.exe
echo.
echo  3. GitHub Release 已创建在:
echo     https://github.com/450326/okx/releases
echo ========================================
echo.
pause
