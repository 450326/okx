# 构建/发布脚本复用的 Node + pnpm 定位逻辑（点源引入：. "$PSScriptRoot\pnpm-env.ps1"）

function Find-NodePath {
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

function Find-Pnpm {
  param([string]$NodePath)

  $command = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($command) {
    return @{ Exe = $command.Source; Prefix = @() }
  }

  if ($NodePath) {
    $candidates = @()
    if ($env:DSH_HOME) {
      $candidates += (Join-Path $env:DSH_HOME 'dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs')
    }
    if ($env:USERPROFILE) {
      $candidates += (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs')
    }
    foreach ($candidate in $candidates) {
      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        return @{ Exe = $NodePath; Prefix = @($candidate) }
      }
    }
  }
  return $null
}

function Initialize-PnpmEnv {
  $nodePath = Find-NodePath
  if (-not $nodePath) {
    throw '未找到 Node。请安装 Node，或确认 DSH 运行环境完整'
  }
  $pnpm = Find-Pnpm -NodePath $nodePath
  if (-not $pnpm) {
    throw '未找到 pnpm。请安装 pnpm（npm i -g pnpm），或确认 DSH 运行环境完整'
  }

  # pnpm 执行 package.json 脚本时会调用 .bin shim，需要 node 在 PATH 里
  $nodeDir = Split-Path -Parent $nodePath
  if ($env:PATH -notlike "*$nodeDir*") {
    $env:PATH = "$nodeDir;$env:PATH"
  }
  # 依赖由脚本显式安装；跳过 pnpm run 前的隐式安装检查
  $env:npm_config_verify_deps_before_run = 'false'

  return [pscustomobject]@{
    NodePath = $nodePath
    Exe      = $pnpm.Exe
    Prefix   = $pnpm.Prefix
  }
}

function Invoke-Pnpm {
  param(
    [Parameter(Mandatory)] $Env,
    [Parameter(Mandatory)] [string[]] $Arguments
  )
  $all = @()
  $all += $Env.Prefix
  $all += $Arguments
  & $Env.Exe @all | Out-Host
  return $LASTEXITCODE
}
