[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'Downloads')
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$destinationDirectory = [System.IO.Path]::GetFullPath($Destination)
if ([System.IO.Path]::GetExtension($destinationDirectory) -eq '.zip') {
  $destinationDirectory = [System.IO.Path]::GetDirectoryName($destinationDirectory)
}
if (-not (Test-Path -LiteralPath $destinationDirectory)) {
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
}
$destinationDirectory = (Resolve-Path -LiteralPath $destinationDirectory).Path
if ($destinationDirectory.StartsWith(
    $source,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
  throw 'Choose a ZIP destination outside the project folder.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath = Join-Path $destinationDirectory "LeetSync-source-handoff-$timestamp.zip"
$tempRoot = [System.IO.Path]::GetFullPath(
  (Join-Path ([System.IO.Path]::GetTempPath()) "LeetSync-handoff-$([guid]::NewGuid().ToString('N'))")
)
$excludedDirectories = @(
  '.git', 'node_modules', '.tmp', 'dist', 'coverage',
  'playwright-report', 'test-results'
)

function Copy-HandoffTree {
  param(
    [string]$From,
    [string]$To
  )

  New-Item -ItemType Directory -Path $To -Force | Out-Null
  foreach ($item in Get-ChildItem -LiteralPath $From -Force) {
    if ($item.PSIsContainer) {
      if ($excludedDirectories -contains $item.Name) { continue }
      if ($item.FullName -match '[\\/]backend[\\/]src[\\/]generated[\\/]prisma$') { continue }
      Copy-HandoffTree -From $item.FullName -To (Join-Path $To $item.Name)
      continue
    }

    if ($item.Name -eq '.env' -or
        ($item.Name.StartsWith('.env.') -and $item.Name -ne '.env.example') -or
        $item.Name.EndsWith('.log') -or
        $item.Name -eq '.DS_Store' -or
        $item.Extension -eq '.zip') {
      continue
    }
    Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $To $item.Name)
  }
}

try {
  Copy-HandoffTree -From $source -To $tempRoot
  Compress-Archive -Path (Join-Path $tempRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "Created: $zipPath" -ForegroundColor Green
  Write-Host 'The archive excludes secrets, Git history, dependencies, and generated build output.'
}
finally {
  $tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($tempRoot.StartsWith($tempParent, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $tempRoot)) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
