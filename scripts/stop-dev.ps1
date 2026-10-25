$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $root '.dev-pids.json'

Write-Host ""
Write-Host "==> 停止 OKX Trading 开发服务" -ForegroundColor Cyan

$stopped = $false

if (Test-Path $pidsFile) {
  try {
    $pids = Get-Content -LiteralPath $pidsFile -Raw | ConvertFrom-Json
    foreach ($id in @($pids.backend, $pids.frontend)) {
      if ($id) {
        & taskkill.exe /PID $id /T /F 2>$null | Out-Null
        $stopped = $true
      }
    }
  } catch {
    Write-Host "读取 .dev-pids.json 失败，改用端口清理" -ForegroundColor Yellow
  }
  Remove-Item -LiteralPath $pidsFile -Force
}

# 兜底：如果 PID 文件丢失，按端口清理
foreach ($port in 3000, 5173) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    if ($connection.OwningProcess) {
      & taskkill.exe /PID $connection.OwningProcess /T /F 2>$null | Out-Null
      $stopped = $true
    }
  }
}

if ($stopped) {
  Write-Host "前端和后端已停止" -ForegroundColor Green
} else {
  Write-Host "没有发现正在运行的开发服务" -ForegroundColor DarkGray
}
Write-Host ""
Start-Sleep -Seconds 1
