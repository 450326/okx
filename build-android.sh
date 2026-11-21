#!/usr/bin/env bash
# ===================================================
#  OKX Trading - Android APK 构建脚本 (macOS / Linux)
#  前置要求:
#     1. JDK 17+
#     2. Android Studio + SDK
#     3. Node.js 18+ 与 pnpm
# ===================================================
set -e

echo "========================================"
echo " OKX Trading - Android APK Builder"
echo "========================================"

echo ""
echo "[1/4] Building frontend..."
pnpm --dir frontend run build
echo "[OK] Frontend build complete."

echo ""
echo "[2/4] Syncing Capacitor..."
pnpm --dir frontend exec cap sync android
echo "[OK] Capacitor sync complete."

echo ""
echo "[3/4] Building Android APK (Release)..."
cd frontend/android
./gradlew assembleRelease
cd ../..
echo "[OK] Android build complete."

echo ""
echo "========================================"
echo " APK 位置:"
echo "   android/app/build/outputs/apk/release/"
echo "   -> app-release-unsigned.apk"
echo ""
echo " 签名命令:"
echo "   jarsigner -verbose -sigalg SHA1withRSA \\"
echo "     -digestalg SHA1 -keystore your.keystore \\"
echo "     android/app/build/outputs/apk/release/app-release-unsigned.apk \\"
echo "     your-alias"
echo "========================================"
