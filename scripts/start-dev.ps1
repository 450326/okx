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

function Wait-Port([int]$port, [int]$timeoutSeconds = 90) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $timeoutSeconds) {
    if (Test-Port $port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

# 优先使用 DSH 内置 Node，找不到时再回退到 PATH
function Resolve-Node {
  $candidates = @()
  if ($env:DSH_HOME) {
    $candidates += (Join-Path $env:DSH_HOME 'dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe')
  }
  if ($env:USERPROFILE) {
    $candidates += (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe')
  }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

# pnpm 优先用 PATH 里的命令；没有时用 DSH 内置的 pnpm.mjs 配合内置 Node 运行
function Resolve-Pnpm([string]$nodePath) {
  $command = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($command) {
    return @{ Exe = $command.Source; Prefix = @() }
  }
  if ($nodePath) {
    $candidates = @()
    if ($env:DSH_HOME) {
      $candidates += (Join-Path $env:DSH_HOME 'dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs')
    }
    if ($env:USERPROFILE) {
      $candidates += (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs')
    }
    foreach ($candidate in $candidates) {
      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        return @{ Exe = $nodePath; Prefix = @($candidate) }
      }
    }
  }
  return $null
}

function Invoke-Pnpm([string[]]$arguments) {
  $all = @()
  $all += $script:pnpm.Prefix
  $all += $arguments
  # 命令输出直接打印到控制台，函数只返回退出码，避免输出被当成返回值
  & $script:pnpm.Exe @all | Out-Host
  return $LASTEXITCODE
}

# 新开窗口运行 pnpm 脚本，返回进程对象
function Start-PnpmWindow([string[]]$arguments, [string]$workdir) {
  $all = @()
  $all += $script:pnpm.Prefix
  $all += $arguments
  $quoted = $all | ForEach-Object {
    $text = [string]$_
    if ($text -match '[\s"]') { '"' + ($text -replace '"', '\"') + '"' } else { $text }
  }
  Start-Process -FilePath $script:pnpm.Exe `
    -ArgumentList ($quoted -join ' ') `
    -WorkingDirectory $workdir `
    -WindowStyle Normal `
    -PassThru
}

# node_modules 缺失，或 pnpm-lock.yaml 比安装标记更新时才重新安装
function Ensure-Dependencies([string]$dir, [string]$label) {
  $modules = Join-Path $dir 'node_modules'
  $marker = Join-Path $modules '.modules.yaml'
  $lock = Join-Path $dir 'pnpm-lock.yaml'
  $upToDate = (Test-Path $marker)
  if ($upToDate -and (Test-Path $lock)) {
    $upToDate = (Get-Item $marker).LastWriteTime -ge (Get-Item $lock).LastWriteTime
  }

  if ($upToDate) {
    Write-Host "$label 依赖已存在" -ForegroundColor DarkGray
    return
  }

  Write-Step "安装$label 依赖（pnpm）"
  $arguments = @('--dir', $dir, 'install', '--ignore-scripts')
  if (Test-Path $lock) { $arguments += '--frozen-lockfile' }
  if ((Invoke-Pnpm $arguments) -ne 0) {
    Fail "$label 依赖安装失败（pnpm install）"
  }
}

Write-Host "========================================" -ForegroundColor Green
Write-Host " OKX Trading - 一键启动前端 + 后端（pnpm）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Step "定位 Node 与 pnpm"
$nodePath = Resolve-Node
if (-not $nodePath) {
  Fail "未找到 Node。请安装 Node，或确认 DSH 运行环境完整"
}
$script:pnpm = Resolve-Pnpm $nodePath
if (-not $script:pnpm) {
  Fail "未找到 pnpm。请安装 pnpm（npm i -g pnpm），或确认 DSH 运行环境完整"
}

# pnpm 执行 package.json 脚本时会调用 nest/vite 等 .bin shim，需要 node 在 PATH 里
$nodeDir = Split-Path -Parent $nodePath
if ($env:PATH -notlike "*$nodeDir*") {
  $env:PATH = "$nodeDir;$env:PATH"
}

# 依赖已由本脚本安装；跳过 pnpm run 前的隐式安装检查，避免因被忽略的构建脚本报错
$env:npm_config_verify_deps_before_run = 'false'
Write-Host "node: $nodePath" -ForegroundColor DarkGray
Write-Host "pnpm: $($script:pnpm.Exe) $($script:pnpm.Prefix -join ' ')" -ForegroundColor DarkGray

Write-Step "检查端口"
foreach ($port in 3000, 5173) {
  if (Test-Port $port) {
    Fail "端口 $port 已被占用。请先运行 stop-dev.bat，或关闭占用该端口的程序"
  }
  Write-Host "端口 $port 可用" -ForegroundColor DarkGray
}

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

Ensure-Dependencies $backendDir "后端"
Ensure-Dependencies $frontendDir "前端"

Write-Step "构建后端（pnpm）"
if ((Invoke-Pnpm @('--dir', $backendDir, 'run', 'build')) -ne 0) {
  Fail "后端构建失败"
}

Write-Step "启动后端（pnpm start:prod）"
$backend = Start-PnpmWindow @('--dir', $backendDir, 'run', 'start:prod') $backendDir

Write-Step "启动前端（pnpm dev）"
$frontend = Start-PnpmWindow @('--dir', $frontendDir, 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173') $frontendDir

$pids = @{
  backend   = $backend.Id
  frontend  = $frontend.Id
  startedAt = (Get-Date).ToString('o')
  tool      = 'pnpm'
}
$pids | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root '.dev-pids.json') -Encoding utf8

Write-Step "等待服务就绪"
$backendReady = Wait-Port 3000 90
$frontendReady = Wait-Port 5173 90

if (-not $backendReady) {
  Write-Host "后端 90 秒内没有监听 3000，请查看后端窗口日志" -ForegroundColor Yellow
}
if (-not $frontendReady) {
  Write-Host "前端 90 秒内没有监听 5173，请查看前端窗口日志" -ForegroundColor Yellow
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
