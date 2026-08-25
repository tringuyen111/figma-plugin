[CmdletBinding()]
param(
  [switch]$KeepBuild,
  [switch]$Pristine,
  [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($KeepBuild -and $Pristine) {
  throw '-KeepBuild and -Pristine are mutually exclusive.'
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$npmCommandInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommandInfo) { $npmCommandInfo = Get-Command npm -ErrorAction Stop }
$npmCommand = $npmCommandInfo.Source
$nodeMajor = [int](& $nodeCommand -p "Number(process.versions.node.split('.')[0])")
if ($LASTEXITCODE -ne 0 -or $nodeMajor -lt 18) {
  throw "Node.js 18 or newer is required; detected major version $nodeMajor."
}

$completed = $false
Push-Location -LiteralPath $PSScriptRoot
try {
  Invoke-Checked -Command $nodeCommand -Arguments @('scripts/clean-generated.mjs')
  if (-not $SkipInstall) {
    Invoke-Checked -Command $npmCommand -Arguments @('ci')
  }
  Invoke-Checked -Command $npmCommand -Arguments @('run', 'build')
  Invoke-Checked -Command $nodeCommand -Arguments @('dist/server/index.js', 'doctor', '--json')
  Invoke-Checked -Command $npmCommand -Arguments @('run', 'check:package')
  $completed = $true
}
finally {
  if (-not $KeepBuild -or -not $completed) {
    & $nodeCommand 'scripts/clean-generated.mjs'
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Generated-output cleanup failed.' }
  }
  if ($Pristine) {
    & $nodeCommand 'scripts/clean-generated.mjs' '--all'
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Dependency/cache cleanup failed.' }
  }
  Pop-Location
}

if (-not $completed) { throw 'Setup did not complete.' }
if ($KeepBuild) {
  Write-Host 'READY: verified runtime bundles are present for local use.'
} elseif ($Pristine) {
  Invoke-Checked -Command $nodeCommand -Arguments @((Join-Path $PSScriptRoot 'scripts/clean-generated.mjs'), '--check', '--all')
  Write-Host 'READY: verification passed and the workspace is pristine source only.'
} else {
  Invoke-Checked -Command $nodeCommand -Arguments @((Join-Path $PSScriptRoot 'scripts/clean-generated.mjs'), '--check')
  Write-Host 'READY: verification passed and generated outputs were removed.'
}
