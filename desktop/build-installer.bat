@echo off
chcp 65001 >nul
setlocal
title OKX Trading - Build Installer (pnpm)
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\build-installer.ps1" %*
endlocal
