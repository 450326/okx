@echo off
REM ===================================================
REM  OKX Trading - Android APK 构建脚本 (Windows)
REM  前置要求:
REM     1. JDK 17+ installed (JAVA_HOME 环境变量)
REM     2. Android Studio + SDK (ANDROID_HOME 环境变量)
REM     3. Node.js 18+
REM ===================================================
echo ========================================
echo  OKX Trading - Android APK Builder
echo ========================================
echo.
echo [1/4] Building frontend...
cd /d "%~dp0"
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend build failed!
    exit /b 1
)
echo [OK] Frontend build complete.
echo.
echo [2/4] Syncing Capacitor...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Capacitor sync failed!
    exit /b 1
)
echo [OK] Capacitor sync complete.
echo.
echo [3/4] Building Android APK (Release)...
cd android
call .\gradlew assembleRelease
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Android build failed!
    cd ..
    exit /b 1
)
cd ..
echo [OK] Android build complete.
echo.
echo ========================================
echo  APK 文件位置:
echo  android\app\build\outputs\apk\release\
echo  -> app-release-unsigned.apk
echo.
echo  注意: 这是未签名的 APK，需要签名才能安装。
echo  生成签名的命令:
echo    jarsigner -verbose -sigalg SHA1withRSA ^
echo      -digestalg SHA1 -keystore 你的密钥库文件 ^
echo      android\app\build\outputs\apk\release\app-release-unsigned.apk ^
echo      你的别名
echo ========================================
pause
