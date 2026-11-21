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
  $hasToken = -not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)
  Write-Host "GH_TOKEN: $(if ($hasToken) { '已设置（将发布到 GitHub Releases）' } else { '未设置（仅本地构建）' })"
  exit 0
}

Write-Host "========================================" -ForegroundColor Green
Write-Host " OKX Trading - 发布新版本（pnpm）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "node: $($pnpmEnv.NodePath)" -ForegroundColor DarkGray
Write-Host "pnpm: $($pnpmEnv.Exe) $($pnpmEnv.Prefix -join ' ')" -ForegroundColor DarkGray
Write-Host ""

$hasToken = -not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)
if ($hasToken) {
  Write-Host "GH_TOKEN 已设置，构建完成后会发布到 GitHub Releases" -ForegroundColor Green
} else {
  Write-Host "未设置 GH_TOKEN，仅本地构建（设置方法：set GH_TOKEN=你的GitHubToken）" -ForegroundColor Yellow
}
Write-Host "版本号会自动增加 0.01" -ForegroundColor DarkGray
Write-Host ""

Write-Step "版本号自增"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $desktopDir, 'run', 'version:bump')) -ne 0) {
  Fail "版本号更新失败"
}

Write-Step "构建前端（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $frontendDir, 'run', 'build')) -ne 0) {
  Fail "前端构建失败"
}

Write-Step "构建后端（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $backendDir, 'run', 'build')) -ne 0) {
  Fail "后端构建失败"
}

Write-Step "安装 Electron 打包依赖（pnpm）"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $desktopDir, 'install', '--ignore-scripts')) -ne 0) {
  Fail "依赖安装失败"
}

Write-Step "准备内置 Node 运行时"
if ((Invoke-Pnpm $pnpmEnv @('--dir', $desktopDir, 'run', 'prepare-runtime')) -ne 0) {
  Fail "内置 Node 运行时准备失败"
}

Write-Step "构建安装程序并发布"
$builderArgs = @('--dir', $desktopDir, 'exec', 'electron-builder', '--win', '--x64')
if ($hasToken) { $builderArgs += '-p'; $builderArgs += 'always' }
if ((Invoke-Pnpm $pnpmEnv $builderArgs) -ne 0) {
  Fail "安装程序构建失败"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " 发布完成" -ForegroundColor Green
Write-Host " 安装程序: desktop\release\OKX Trading Setup *.exe" -ForegroundColor Green
Write-Host " GitHub: https://github.com/450326/okx/releases" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：提交版本号并推送" -ForegroundColor Yellow
Write-Host "  git add desktop/package.json" -ForegroundColor DarkGray
Write-Host "  git commit -m `"bump desktop version`"" -ForegroundColor DarkGray
Write-Host "  git push origin main" -ForegroundColor DarkGray
Write-Host ""
pause
