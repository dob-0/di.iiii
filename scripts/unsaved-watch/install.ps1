# The daily "only on this machine" watch, for Windows (Task Scheduler).
#
#   powershell -ExecutionPolicy Bypass -File scripts\unsaved-watch\install.ps1 [-Folders C:\a,C:\b]
#   powershell -ExecutionPolicy Bypass -File scripts\unsaved-watch\install.ps1 -Uninstall
#
# Default folders: %USERPROFILE%\dev and %USERPROFILE%\OneDrive\Desktop (whichever exist).
# Copies scripts\unsaved.mjs + unsaved-lib.mjs into %LOCALAPPDATA%\di\unsaved (so the watch
# never depends on which branch a checkout is on), and registers the task "di unsaved" for
# the current user: daily at 18:00 and at logon, and a missed run starts when the PC is next on.
#   - a Windows notification when something has sat only on this PC for more than 24 hours
#   - the full list appended to %LOCALAPPDATA%\di\unsaved.log   <- the one place to look
#   - Task Scheduler shows the last run and its result
# Run it again after pulling a newer di.iiii to refresh the copy. CONTRIBUTING.md
# "Every hand, one flow".
param(
  [string[]]$Folders,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$TaskName = 'di unsaved'
$AppDir = Join-Path $env:LOCALAPPDATA 'di\unsaved'
$Log = Join-Path $env:LOCALAPPDATA 'di\unsaved.log'
$Src = Split-Path -Parent $PSScriptRoot

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $AppDir -ErrorAction SilentlyContinue
  Write-Host "  di unsaved: removed (the log stays at $Log)"
  exit 0
}

$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { Write-Error '  di unsaved: node not found on PATH - install Node 20+ first' }

if (-not $Folders) {
  $Folders = @((Join-Path $env:USERPROFILE 'dev'), (Join-Path $env:USERPROFILE 'OneDrive\Desktop')) | Where-Object { Test-Path $_ }
}
foreach ($f in $Folders) { if (-not (Test-Path $f -PathType Container)) { Write-Error "  di unsaved: no such folder: $f" } }

New-Item -ItemType Directory -Force $AppDir | Out-Null
Copy-Item (Join-Path $Src 'unsaved.mjs'), (Join-Path $Src 'unsaved-lib.mjs') $AppDir -Force
$commit = (git -C $Src rev-parse --short HEAD 2>$null); if (-not $commit) { $commit = 'unknown' }
"Copied from $Src at $commit, $(Get-Date -Format o).`r`nDo not edit here - edit scripts\ in di.iiii and re-run scripts\unsaved-watch\install.ps1." |
  Set-Content (Join-Path $AppDir 'SOURCE.txt')

$argList = @("`"$(Join-Path $AppDir 'unsaved.mjs')`"", '--older-than', '24', '--notify', '--log', "`"$Log`"") + ($Folders | ForEach-Object { "`"$_`"" })
$action = New-ScheduledTaskAction -Execute $Node -Argument ($argList -join ' ')
$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At 18:00),
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
)
# StartWhenAvailable: a laptop that was off at 18:00 runs it at the next chance.
# AllowStartIfOnBatteries: a laptop on battery must still run it (the default would queue it).
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
# Interactive: runs in the signed-in user's session, which a notification needs; no stored password.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
  -Description 'Lists work that lives only on this PC (di.iiii "Every hand, one flow"). Source: scripts\unsaved-watch\install.ps1' -Force | Out-Null

Write-Host "  di unsaved: on - daily 18:00 and at logon over: $($Folders -join ', ')"
Write-Host "  log: $Log   run now: Start-ScheduledTask 'di unsaved'   undo: install.ps1 -Uninstall"
