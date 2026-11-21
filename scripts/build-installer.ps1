param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. (Join-Path $PSScriptRoot 'pnpm-env.ps1')

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Fail([string]$message) {
  Write-Host ""
  Write-Host "[ERROR] $message" -ForegroundColor Red
  Write-Host ""
  Read-Host "按 Enter 退出"
  exit 1
}

try {
  $pnpmEnv = Initialize-PnpmEnv
} catch {
  Fail $_.Exception.Message
}

$frontendDir = Join-Path $root 'frontend'
$backendDir = Join-Path $root 'backend'
$desktopDir = Join-Path $root 'desktop'

if ($Check) {
  Write-Host "node: $($pnpmEnv.NodePath)"
  Write-Host "pnpm: $($pnpmEnv.Exe) $($pnpmEnv.Prefix -join ' ')"
  Write-Host "root: $root"
  exit 0
}

Write-Host "========================================" -ForegroundColor Green
Write-Host " OKX Trading - Windows 安装程序构建（pnpm）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "node: $($pnpmEnv.NodePath)" -ForegroundColor DarkGray
Write-Host "pnpm: $($pnpmEnv.Exe) $($pnpmEnv.Prefix -join ' ')" -ForegroundColor DarkGray

Write-Step "安装前端依赖（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $frontendDir, 'install', '--ignore-scripts')) -ne 0) {
  Fail "前端依赖安装失败"
}

Write-Step "构建前端（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $frontendDir, 'run', 'build')) -ne 0) {
  Fail "前端构建失败"
}

Write-Step "安装后端依赖（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $backendDir, 'install', '--ignore-scripts')) -ne 0) {
  Fail "后端依赖安装失败"
}

Write-Step "构建后端（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $backendDir, 'run', 'build')) -ne 0) {
  Fail "后端构建失败"
}

Write-Step "安装 Electron 打包依赖（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $desktopDir, 'install', '--ignore-scripts')) -ne 0) {
  Fail "Electron 依赖安装失败"
}

Write-Step "准备内置 Node 运行时"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $desktopDir, 'run', 'prepare-runtime')) -ne 0) {
  Fail "内置 Node 运行时准备失败"
}

Write-Step "构建 Windows 安装程序（electron-builder）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $desktopDir, 'exec', 'electron-builder', '--win')) -ne 0) {
  Fail "安装程序构建失败"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " 构建完成" -ForegroundColor Green
Write-Host " 安装程序位于: desktop\release\OKX Trading Setup *.exe" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
pause
