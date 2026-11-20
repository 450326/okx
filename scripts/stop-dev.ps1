$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $root '.dev-pids.json'

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

function Wait-PortsFree([int]$timeoutSeconds = 10) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $timeoutSeconds) {
    if (-not (Test-Port 3000) -and -not (Test-Port 5173)) { return $true }
    Start-Sleep -Milliseconds 300
  }
  return $false
}

function Stop-Tree([int]$processId) {
  & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
}

Write-Host ""
Write-Host "==> 停止 OKX Trading 开发服务（pnpm）" -ForegroundColor Cyan

$stopped = $false

if (Test-Path $pidsFile) {
  try {
    $pids = Get-Content -LiteralPath $pidsFile -Raw | ConvertFrom-Json
    foreach ($id in @($pids.backend, $pids.frontend)) {
      if ($id) {
        Stop-Tree ([int]$id)
        $stopped = $true
      }
    }
  } catch {
    Write-Host "读取 .dev-pids.json 失败，改用端口清理" -ForegroundColor Yellow
  }
  Remove-Item -LiteralPath $pidsFile -Force
}

# 等待进程树退出；端口仍占用时按端口兜底
if (-not (Wait-PortsFree 8)) {
  foreach ($port in 3000, 5173) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
      if ($connection.OwningProcess) {
        Stop-Tree ([int]$connection.OwningProcess)
        $stopped = $true
      }
    }
  }
  Wait-PortsFree 5 | Out-Null
}

if ($stopped) {
  Write-Host "前端和后端已停止" -ForegroundColor Green
} else {
  Write-Host "没有发现正在运行的开发服务" -ForegroundColor DarkGray
}
Write-Host ""
Start-Sleep -Seconds 1
