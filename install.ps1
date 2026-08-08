# di.iiii — one line, on your own machine. Windows.
#
#   irm https://di-studio.xyz/get.ps1 | iex
#
# Same job and same shape as install.sh: work out the machine, make sure there
# is a node, download the current release, check it, hand over to bootstrap.mjs.
# Two URLs rather than one because PowerShell cannot run the sh script, and
# serving different bodies from one path by User-Agent breaks every cache.
#
# Nothing is written outside the user profile. Nothing needs administrator.

$ErrorActionPreference = 'Stop'

$Repo = 'dob-0/di.iiii'
$NodeVersion = 'v22.22.0'
$DiHome = if ($env:DI_HOME) { $env:DI_HOME } else { Join-Path $env:USERPROFILE '.di' }

function Info($message) { Write-Host $message }
function Die($message) { Write-Host '' ; Write-Error $message ; exit 1 }

# ── what machine is this ─────────────────────────────────────────────────────

$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { 'x64' }
    'ARM64' { 'arm64' }
    default { Die "di.iiii does not have a build for $($env:PROCESSOR_ARCHITECTURE)." }
}

if ($env:DI_INSTALL_DRY -eq '1') {
    Info 'di.iiii install plan'
    Info "  os      windows/$Arch"
    Info "  home    $DiHome"
    $found = (Get-Command node -ErrorAction SilentlyContinue)
    Info "  node    $(if ($found) { & node -v } else { 'none — would download' })"
    Info "  source  https://github.com/$Repo/releases/latest"
    exit 0
}

# ── a node to run the CLI with ───────────────────────────────────────────────

function Test-NodeOk($exe) {
    if (-not $exe) { return $false }
    try { $raw = & $exe -v 2>$null } catch { return $false }
    if (-not $raw) { return $false }
    $parts = ($raw -replace '^v', '').Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    # node:sqlite is only unflagged later in the 22 line — an older 22 boots and
    # then dies on an unknown module.
    return ($major -gt 22) -or ($major -eq 22 -and $minor -ge 15)
}

$VendoredNode = Join-Path $DiHome 'runtime\node\node.exe'
$DiNode = $null
if (Test-NodeOk $VendoredNode) {
    $DiNode = $VendoredNode
} elseif ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-NodeOk 'node')) {
    $DiNode = (Get-Command node).Source
} else {
    Info "getting node $NodeVersion…"
    $NodePkg = "node-$NodeVersion-win-$Arch"
    $NodeUrl = "https://nodejs.org/dist/$NodeVersion/$NodePkg.zip"
    $tmpNode = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $tmpNode -Force | Out-Null
    try {
        Invoke-WebRequest -Uri $NodeUrl -OutFile "$tmpNode\node.zip" -UseBasicParsing
    } catch {
        Die @"
di.iiii could not start on this machine.

  node.js     not found, and nodejs.org could not be reached

You need one of these. Pick whichever sounds easier:

  Docker Desktop   https://docker.com/products/docker-desktop
                   install it, open it once, then run this line again
  Node.js 22       https://nodejs.org  — the big green LTS button

Nothing was installed.
"@
    }
    $runtime = Join-Path $DiHome 'runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    Remove-Item -Recurse -Force (Join-Path $runtime 'node') -ErrorAction SilentlyContinue
    Expand-Archive -Path "$tmpNode\node.zip" -DestinationPath $tmpNode -Force
    Move-Item (Join-Path $tmpNode $NodePkg) (Join-Path $runtime 'node')
    Remove-Item -Recurse -Force $tmpNode -ErrorAction SilentlyContinue
    $DiNode = Join-Path $runtime 'node\node.exe'
    if (-not (Test-NodeOk $DiNode)) { Die 'the node di.iiii downloaded does not run on this machine.' }
}

# ── the release ──────────────────────────────────────────────────────────────

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

if ($env:DI_INSTALL_ARTIFACT) {
    # How CI exercises this against a build that has not been released yet.
    $Version = if ($env:DI_INSTALL_VERSION) { $env:DI_INSTALL_VERSION } else { '0.0.0-local' }
    $Artifact = "di-runtime-$Version.tar.gz"
    Copy-Item $env:DI_INSTALL_ARTIFACT (Join-Path $tmp $Artifact)
    Info "installing $Version from disk…"
} else {
    Info 'finding the newest di.iiii…'
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
    $Version = $release.tag_name -replace '^v', ''
    if (-not $Version) { Die 'could not read the release feed — is github.com reachable?' }
    $Artifact = "di-runtime-$Version.tar.gz"
    $base = "https://github.com/$Repo/releases/download/v$Version"

    Info "downloading $Version…"
    Invoke-WebRequest -Uri "$base/$Artifact" -OutFile (Join-Path $tmp $Artifact) -UseBasicParsing

    try {
        Invoke-WebRequest -Uri "$base/checksums.txt" -OutFile (Join-Path $tmp 'checksums.txt') -UseBasicParsing
        $want = (Select-String -Path (Join-Path $tmp 'checksums.txt') -Pattern ([regex]::Escape($Artifact)) |
            Select-Object -First 1).Line.Split(' ')[0]
        $got = (Get-FileHash -Path (Join-Path $tmp $Artifact) -Algorithm SHA256).Hash.ToLower()
        if ($want -and $got -ne $want) {
            Die "checksum mismatch — refusing to install.`n  expected $want`n  got      $got"
        }
    } catch {
        Info '  (no checksums published for this release)'
    }
}

# Staged inside DI_HOME so bootstrap's rename stays on one volume, and .partial
# keeps a failed install from leaving something that looks installed.
$Staged = Join-Path $DiHome "versions\$Version.partial"
Remove-Item -Recurse -Force $Staged -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Staged -Force | Out-Null

# Windows ships bsdtar at System32\tar.exe and it understands `C:\...`. Git for
# Windows ships GNU tar, which is often first on PATH and reads a leading `C:` as
# a REMOTE HOST — it fails with "Cannot connect to C: resolve failed", naming
# neither tar nor the drive letter. So call bsdtar by full path, and only fall
# back to whatever `tar` is with --force-local, which tells GNU tar that a colon
# is just a colon.
$SystemTar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (Test-Path $SystemTar) {
    & $SystemTar -xzf (Join-Path $tmp $Artifact) -C $Staged --strip-components 1
} else {
    & tar --force-local -xzf (Join-Path $tmp $Artifact) -C $Staged --strip-components 1
}
if ($LASTEXITCODE -ne 0) { Die 'could not unpack the download.' }
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

# ── hand over ────────────────────────────────────────────────────────────────

$env:DI_HOME = $DiHome
& $DiNode (Join-Path $Staged 'cli\bootstrap.mjs') --staged $Staged --version $Version
exit $LASTEXITCODE
