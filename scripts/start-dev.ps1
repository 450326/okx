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

Write-Host "========================================" -ForegroundColor Green
Write-Host " OKX Trading - 一键启动前端 + 后端" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Step "检查 Node.js / npm"
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}

$bundledNode = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$useBundledNode = $false

if ($node -and $npm) {
  Write-Host "node: $($node.Source)" -ForegroundColor DarkGray
  Write-Host "npm : $($npm.Source)" -ForegroundColor DarkGray
} elseif (Test-Path $bundledNode) {
  $useBundledNode = $true
  Write-Host "未检测到系统 Node/npm，使用内置 Node 运行" -ForegroundColor Yellow
  Write-Host "node: $bundledNode" -ForegroundColor DarkGray
} else {
  Fail "未检测到 Node.js/npm。请安装 Node.js 18+，或使用 DSH 桌面端自带的运行环境"
}

Write-Step "检查端口"
foreach ($port in 3000, 5173) {
  if (Test-Port $port) {
    Fail "端口 $port 已被占用。请先运行 stop-dev.bat，或关闭占用该端口的程序"
  }
  Write-Host "端口 $port 可用" -ForegroundColor DarkGray
}

if (-not (Test-Path (Join-Path $root 'backend\node_modules'))) {
  if ($useBundledNode) {
    Fail "缺少 backend\node_modules，内置 Node 模式无法自动安装依赖。请安装 Node.js 后运行一次 npm install"
  }
  Write-Step "安装后端依赖（首次启动，需要几分钟）"
  Push-Location (Join-Path $root 'backend')
  try {
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host ""
  Write-Host "后端依赖已存在，跳过安装" -ForegroundColor DarkGray
}

if (-not (Test-Path (Join-Path $root 'frontend\node_modules'))) {
  if ($useBundledNode) {
    Fail "缺少 frontend\node_modules，内置 Node 模式无法自动安装依赖。请安装 Node.js 后运行一次 npm install"
  }
  Write-Step "安装前端依赖（首次启动，需要几分钟）"
  Push-Location (Join-Path $root 'frontend')
  try {
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "前端依赖已存在，跳过安装" -ForegroundColor DarkGray
}

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

if ($useBundledNode) {
  # 没有系统 Node/npm 时，直接用内置 Node 构建并运行后端，再启动 Vite。
  $nestCli = Join-Path $backendDir 'node_modules\@nestjs\cli\bin\nest.js'
  if (-not (Test-Path $nestCli)) {
    Fail "缺少 @nestjs/cli，无法构建后端。请安装 Node.js 后运行 npm install"
  }

  Write-Step "构建后端（内置 Node）"
  Push-Location $backendDir
  try {
    & $bundledNode $nestCli build
    if ($LASTEXITCODE -ne 0) { throw "后端构建失败" }
  } finally {
    Pop-Location
  }

  $viteBin = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path $viteBin)) {
    Fail "缺少 vite，无法启动前端。请安装 Node.js 后运行 npm install"
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
} else {
  Write-Step "启动后端（新窗口）"
  $backend = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/k', 'npm run start:dev' `
    -WorkingDirectory $backendDir `
    -PassThru

  Write-Step "启动前端（新窗口）"
  $frontend = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/k', 'npm run dev' `
    -WorkingDirectory $frontendDir `
    -PassThru
}

$pids = @{
  backend  = $backend.Id
  frontend = $frontend.Id
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
