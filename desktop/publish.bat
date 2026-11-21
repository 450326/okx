@echo off
chcp 65001 >nul
setlocal
title OKX Trading - Publish Desktop Release (pnpm)
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\publish-desktop.ps1" %*
endlocal
