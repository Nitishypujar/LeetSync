$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $repoRoot 'extension'
$manifestPath = Join-Path $extensionRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if ($manifest.manifest_version -ne 3) {
    throw 'The extension manifest must use Manifest V3.'
}

$requiredFiles = @(
    'manifest.json',
    'background.js',
    'bridge.js',
    'page-hook.js',
    'popup.html',
    'popup.js',
    'popup.css'
)

foreach ($relativePath in $requiredFiles) {
    $file = Join-Path $extensionRoot $relativePath
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Required extension file is missing: $relativePath"
    }
}

$outputDirectory = Join-Path $repoRoot 'dist'
$archivePath = Join-Path $outputDirectory "LeetSync-$($manifest.version).zip"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

$packageFiles = Get-ChildItem -LiteralPath $extensionRoot -File |
    Where-Object { $_.Name -notlike '*.test.mjs' }
Compress-Archive -LiteralPath $packageFiles.FullName -DestinationPath $archivePath

$entries = @([System.IO.Compression.ZipFile]::OpenRead($archivePath).Entries | ForEach-Object FullName)
foreach ($relativePath in $requiredFiles) {
    if ($relativePath -notin $entries) {
        throw "Packaged extension is missing: $relativePath"
    }
}
if ($entries | Where-Object { $_ -match '(^|/)tests?/' -or $_ -match '\.test\.' }) {
    throw 'The release archive must not contain test files.'
}

Write-Host "Packaged LeetSync $($manifest.version): $archivePath" -ForegroundColor Green
Write-Host "Included $($entries.Count) files; manifest ID key preserved."
