param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Fail([string]$message) {
  Write-Host ""
  Write-Host "启动失败：$message" -ForegroundColor Red
  Write-Host ""
  Read-Host "按 Enter 退出"
  exit 1
}

function Test-Port([int]$port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(300)
    if ($ok -and $client.Connected) {
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Wait-Port([int]$port, [int]$timeoutSeconds = 60) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $timeoutSeconds) {
    if (Test-Port $port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Resolve-BundledNode {
  $candidates = @()

  if ($env:DSH_HOME) {
    $candidates += (Join-Path $env:DSH_HOME 'dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe')
  }
  if ($env:USERPROFILE) {
    $candidates += (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe')
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  return $null
}

Write-Host "========================================" -ForegroundColor Green
Write-Host " OKX Trading - 一键启动前端 + 后端" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Step "定位 DSH 内置 Node（不依赖系统 Node/npm）"
$bundledNode = Resolve-BundledNode
if (-not $bundledNode) {
  Fail "未找到 DSH 内置 Node。本脚本不会联网下载 Node，请确认 DSH 运行环境完整"
}
Write-Host "node: $bundledNode" -ForegroundColor DarkGray

Write-Step "检查端口"
foreach ($port in 3000, 5173) {
  if (Test-Port $port) {
    Fail "端口 $port 已被占用。请先运行 stop-dev.bat，或关闭占用该端口的程序"
  }
  Write-Host "端口 $port 可用" -ForegroundColor DarkGray
}

Write-Step "检查本地依赖（不联网下载）"
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$nestCli = Join-Path $backendDir 'node_modules\@nestjs\cli\bin\nest.js'
$viteBin = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'

if (-not (Test-Path (Join-Path $backendDir 'node_modules'))) {
  Fail "缺少 backend\node_modules。本脚本不会联网下载依赖，请保留已安装的依赖目录"
}
if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
  Fail "缺少 frontend\node_modules。本脚本不会联网下载依赖，请保留已安装的依赖目录"
}
if (-not (Test-Path $nestCli)) {
  Fail "缺少 backend\@nestjs\cli。本脚本不会联网下载依赖，请保留已安装的依赖目录"
}
if (-not (Test-Path $viteBin)) {
  Fail "缺少 frontend\vite。本脚本不会联网下载依赖，请保留已安装的依赖目录"
}
Write-Host "后端依赖已存在" -ForegroundColor DarkGray
Write-Host "前端依赖已存在" -ForegroundColor DarkGray

Write-Step "构建后端（内置 Node，不联网）"
Push-Location $backendDir
try {
  & $bundledNode $nestCli build
  if ($LASTEXITCODE -ne 0) { throw "后端构建失败" }
} finally {
  Pop-Location
}

Write-Step "启动后端（内置 Node）"
$backend = Start-Process -FilePath $bundledNode `
  -ArgumentList @('dist/main.js') `
  -WorkingDirectory $backendDir `
  -WindowStyle Normal `
  -PassThru

Write-Step "启动前端（内置 Node）"
$frontend = Start-Process -FilePath $bundledNode `
  -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173') `
  -WorkingDirectory $frontendDir `
  -WindowStyle Normal `
  -PassThru

$pids = @{
  backend   = $backend.Id
  frontend  = $frontend.Id
  startedAt = (Get-Date).ToString('o')
}
$pids | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root '.dev-pids.json') -Encoding utf8

Write-Step "等待服务就绪"
$backendReady = Wait-Port 3000 60
$frontendReady = Wait-Port 5173 60

if (-not $backendReady) {
  Write-Host "后端 60 秒内没有监听 3000，请查看后端窗口日志" -ForegroundColor Yellow
}
if (-not $frontendReady) {
  Write-Host "前端 60 秒内没有监听 5173，请查看前端窗口日志" -ForegroundColor Yellow
}

if ($backendReady -and $frontendReady) {
  if (-not $NoBrowser) {
    Start-Process 'http://127.0.0.1:5173/'
  }
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Green
  Write-Host " 启动完成" -ForegroundColor Green
  Write-Host " 前端: http://127.0.0.1:5173/" -ForegroundColor Green
  Write-Host " 后端: http://127.0.0.1:3000/api/v1/health" -ForegroundColor Green
  Write-Host " 停止: 双击 stop-dev.bat" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Start-Sleep -Seconds 2
} else {
  Write-Host ""
  Write-Host "服务没有完全启动，请查看两个新窗口里的报错。" -ForegroundColor Yellow
  Read-Host "按 Enter 退出"
  exit 1
}
