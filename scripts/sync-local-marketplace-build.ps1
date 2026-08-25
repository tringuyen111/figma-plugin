param(
  [Parameter(Mandatory = $true)][string]$Archive,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$BackupRoot,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{16}$')][string]$ExpectedBundleRevision,
  [string]$AllowedMarketplaceRoot = (Join-Path $HOME '.codex\marketplaces\figma-plugin-local\plugins')
)

$ErrorActionPreference = 'Stop'

$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$targetPath = (Resolve-Path -LiteralPath $Target).Path
$allowedRoot = [IO.Path]::GetFullPath($AllowedMarketplaceRoot)
$sourcePackagePath = Join-Path $PSScriptRoot '..\package.json'
$sourcePackage = Get-Content -LiteralPath $sourcePackagePath -Encoding UTF8 | ConvertFrom-Json
$expectedVersion = [string]$sourcePackage.version
$backupRootPath = [IO.Path]::GetFullPath($BackupRoot)

if (-not $targetPath.StartsWith($allowedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing marketplace replacement outside ${allowedRoot}: $targetPath"
}
if ([IO.Path]::GetFileName($targetPath) -ne 'figma-plugin') {
  throw "Refusing unexpected marketplace target: $targetPath"
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('figma-plugin-sync-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
& tar.exe -xzf $archivePath -C $tempRoot
if ($LASTEXITCODE -ne 0) { throw "tar extraction failed with exit code $LASTEXITCODE" }

$extracted = Join-Path $tempRoot 'package'
$manifestPath = Join-Path $extracted '.codex-plugin\plugin.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Extracted package is missing .codex-plugin/plugin.json' }
$manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
if ($manifest.name -ne 'figma-plugin' -or $manifest.version -ne $expectedVersion) {
  throw "Unexpected extracted identity: $($manifest.name)@$($manifest.version)"
}
$bundlePath = Join-Path $extracted 'dist\server\index.js'
$pluginBundlePath = Join-Path $extracted 'plugin\code.js'
if (-not (Select-String -LiteralPath $bundlePath -SimpleMatch $ExpectedBundleRevision -Quiet)) {
  throw "Extracted server bundle does not contain revision $ExpectedBundleRevision"
}
if (-not (Select-String -LiteralPath $pluginBundlePath -SimpleMatch $ExpectedBundleRevision -Quiet)) {
  throw "Extracted Figma plugin bundle does not contain revision $ExpectedBundleRevision"
}

New-Item -ItemType Directory -Path $backupRootPath -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRootPath ("$stamp-figma-plugin-$expectedVersion-pre-$ExpectedBundleRevision")
if (Test-Path -LiteralPath $backupPath) { throw "Backup destination already exists: $backupPath" }

Move-Item -LiteralPath $targetPath -Destination $backupPath
Move-Item -LiteralPath $extracted -Destination $targetPath

$installedManifest = Get-Content -LiteralPath (Join-Path $targetPath '.codex-plugin\plugin.json') -Encoding UTF8 | ConvertFrom-Json
[ordered]@{
  target = $targetPath
  backup = $backupPath
  extractedFrom = $archivePath
  name = $installedManifest.name
  version = $installedManifest.version
  bundleRevision = $ExpectedBundleRevision
  tempRoot = $tempRoot
} | ConvertTo-Json -Compress
