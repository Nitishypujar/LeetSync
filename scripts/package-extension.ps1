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
$archivePath = if ($env:LEETSYNC_PACKAGE_PATH) {
    [System.IO.Path]::GetFullPath($env:LEETSYNC_PACKAGE_PATH)
} else {
    Join-Path $outputDirectory "LeetSync-$($manifest.version).zip"
}
$apiOriginValue = if ($env:LEETSYNC_API_ORIGIN) {
    $env:LEETSYNC_API_ORIGIN
} else {
    'https://leetsync-nitishypujar.onrender.com'
}
$dashboardOriginValue = if ($env:LEETSYNC_DASHBOARD_ORIGIN) {
    $env:LEETSYNC_DASHBOARD_ORIGIN
} else {
    $apiOriginValue
}

function ConvertTo-ExtensionOriginPattern([string]$value, [string]$name) {
    $uri = $null
    if (-not [Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or
        $uri.UserInfo -or
        $uri.Query -or
        $uri.Fragment -or
        $uri.AbsolutePath -ne '/') {
        throw "$name must be a bare HTTPS origin, for example https://app.example.com"
    }
    return "$($uri.GetLeftPart([UriPartial]::Authority))/*"
}

$apiOrigin = ConvertTo-ExtensionOriginPattern $apiOriginValue 'LEETSYNC_API_ORIGIN'
$dashboardOrigin = ConvertTo-ExtensionOriginPattern $dashboardOriginValue 'LEETSYNC_DASHBOARD_ORIGIN'
$manifest.host_permissions = @(
    $apiOrigin,
    'https://leetcode.com/*',
    'https://leetcode.cn/*'
)
$manifest.externally_connectable.matches = @($dashboardOrigin)

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $archivePath) -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingDirectory = Join-Path $tempRoot "leetsync-extension-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

try {
    Get-ChildItem -LiteralPath $extensionRoot -File |
        Where-Object { $_.Name -ne 'manifest.json' -and $_.Name -notlike '*.test.mjs' } |
        ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $stagingDirectory
        }
    $manifestJson = $manifest | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText(
        (Join-Path $stagingDirectory 'manifest.json'),
        $manifestJson,
        [System.Text.UTF8Encoding]::new($false)
    )

    $packageFiles = Get-ChildItem -LiteralPath $stagingDirectory -File
    Compress-Archive -LiteralPath $packageFiles.FullName -DestinationPath $archivePath
} finally {
    $resolvedStagingDirectory = [System.IO.Path]::GetFullPath($stagingDirectory)
    if (-not $resolvedStagingDirectory.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a staging directory outside the system temporary folder: $resolvedStagingDirectory"
    }
    Remove-Item -LiteralPath $resolvedStagingDirectory -Recurse -Force
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @($archive.Entries | ForEach-Object FullName)
    $manifestEntry = $archive.GetEntry('manifest.json')
    if (-not $manifestEntry) {
        throw 'Packaged manifest.json is missing.'
    }
    $manifestStream = $manifestEntry.Open()
    try {
        $reader = [System.IO.StreamReader]::new($manifestStream)
        try {
            $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
        } finally {
            $reader.Dispose()
        }
    } finally {
        $manifestStream.Dispose()
    }
} finally {
    $archive.Dispose()
}

foreach ($relativePath in $requiredFiles) {
    if ($relativePath -notin $entries) {
        throw "Packaged extension is missing: $relativePath"
    }
}
if ($entries | Where-Object { $_ -match '(^|/)tests?/' -or $_ -match '\.test\.' }) {
    throw 'The release archive must not contain test files.'
}
if ($manifest.key -ne $packagedManifest.key) {
    throw 'The stable manifest key was not preserved in the release archive.'
}
if ($packagedManifest.host_permissions -contains 'http://localhost:3000/*' -or
    $packagedManifest.host_permissions -contains 'http://127.0.0.1:3000/*' -or
    $packagedManifest.host_permissions -contains 'https://api.leetsync.app/*') {
    throw 'Development or unconfigured API hosts must not be packaged.'
}
if ($packagedManifest.externally_connectable.matches -contains 'http://localhost:5173/*' -or
    $packagedManifest.externally_connectable.matches -contains 'http://127.0.0.1:5173/*') {
    throw 'Local dashboard origins must not be packaged.'
}
if ($apiOrigin -notin $packagedManifest.host_permissions -or
    $dashboardOrigin -notin $packagedManifest.externally_connectable.matches) {
    throw 'The package does not contain exactly the configured API and dashboard origins.'
}

Write-Host "Packaged LeetSync $($manifest.version): $archivePath" -ForegroundColor Green
Write-Host "Included $($entries.Count) files; stable ID preserved; configured HTTPS origins only; development hosts excluded."
