<#
.SYNOPSIS
    Weekly hygiene restart of the Power Automate Desktop runtime on MHS-SYD-APP47.

.DESCRIPTION
    Both BJC PAD flows (SMEC AI BJC PDF-to-directory and SMEC AI BJC PDF-to-HL7)
    have a history of silently stopping after days while Task Scheduler keeps
    reporting (0x0). This script:

      1. Confirms it is running elevated (Restart-Service needs admin).
      2. Waits for any in-flight flow run (PAD.Robin.Host.exe) to finish.
      3. Kills the PAD console / robin / designer processes.
      4. Restarts the "Power Automate Service" Windows service.
      5. Optionally (-SmokeRun) starts the PDF-to-HL7 task and confirms the
         console came back and wrote a fresh run log.

    The next 10-minute flow trigger relaunches PAD.Console.Host.exe on its own
    (that is how the existing At-startup trigger recovers), so nothing else
    needs to be started here.

    Every failure path exits NON-ZERO so Task Scheduler shows it. Do not
    "fix" that by swallowing errors — the whole point is visibility.

    Exit codes:
      0  success
      2  not elevated (processes were still killed; service restart skipped)
      3  smoke run failed (console did not come back / no new run log)
      4  Power Automate service not found
      5  service did not reach Running within the timeout

.PARAMETER LogPath
    Append-only log. Default: C:\SMEC AI\pad-restart.log

.PARAMETER MaxWaitMinutes
    Max time to wait for PAD.Robin.Host.exe to disappear before killing anyway.

.PARAMETER SmokeRun
    After the restart, start the flow task named by -FlowTaskName and verify
    the console relaunched and wrote a new run log.

.PARAMETER FlowTaskName
    Task Scheduler task to use for the smoke run.

.NOTES
    Runbook: docs/operations/pad-integration-guide.md §14.
    Targets Windows PowerShell 5.1 (built in). Avoid PS 7-only syntax.
#>
[CmdletBinding()]
param(
    [string]$LogPath = 'C:\SMEC AI\pad-restart.log',
    [int]$MaxWaitMinutes = 4,
    [switch]$SmokeRun,
    [string]$FlowTaskName = 'SMEC AI BJC PDF-to-HL7'
)

$ErrorActionPreference = 'Stop'
$PadProcessNames = @('PAD.Console.Host', 'PAD.Robin.Host', 'PAD.Designer.Host')
$RunLogDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Power Automate Desktop\Console\Logs'

function Write-Log {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    try {
        $dir = Split-Path -Parent $LogPath
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    } catch {
        # Never let logging itself abort the restart.
    }
    Write-Output $line
}

function Exit-WithCode {
    param([int]$Code, [string]$Message)
    Write-Log ('END exit={0} {1}' -f $Code, $Message)
    exit $Code
}

Write-Log ('BEGIN Restart-PadRuntime user={0} host={1} smoke={2}' -f `
    [Security.Principal.WindowsIdentity]::GetCurrent().Name, $env:COMPUTERNAME, [bool]$SmokeRun)

# ---- 1. Elevation check --------------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isElevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Log ('elevated={0}' -f $isElevated)

# ---- 2. Wait for in-flight flow runs to finish ----------------------------
$deadline = (Get-Date).AddMinutes($MaxWaitMinutes)
$quietSince = $null
$waitedOut = $false
while ($true) {
    $robin = Get-Process -Name 'PAD.Robin.Host' -ErrorAction SilentlyContinue
    if ($robin) {
        $quietSince = $null
        Write-Log ('flow run in progress (PAD.Robin.Host x{0}) - waiting' -f @($robin).Count)
    } else {
        if (-not $quietSince) { $quietSince = Get-Date }
        if (((Get-Date) - $quietSince).TotalSeconds -ge 20) { break }
    }
    if ((Get-Date) -ge $deadline) { $waitedOut = $true; break }
    Start-Sleep -Seconds 10
}
if ($waitedOut) {
    Write-Log ('WARN quiescence not reached after {0} min - proceeding with kill' -f $MaxWaitMinutes)
} else {
    Write-Log 'no flow run in progress - proceeding'
}

# ---- 3. Kill PAD processes ------------------------------------------------
foreach ($name in $PadProcessNames) {
    $procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-Log ('kill {0}: not running' -f $name)
        continue
    }
    try {
        $procs | Stop-Process -Force -ErrorAction Stop
        Write-Log ('kill {0}: stopped {1}' -f $name, $procs.Count)
    } catch {
        Write-Log ('WARN kill {0} failed: {1}' -f $name, $_.Exception.Message)
    }
}
$restartedAt = Get-Date

# ---- 4. Restart the Power Automate service --------------------------------
if (-not $isElevated) {
    Exit-WithCode 2 'NOT ELEVATED - service restart skipped. medihost must be a local Administrator (or import the SYSTEM task variant).'
}

# Prefer the runtime service by exact name, then exact display name. Never the
# crash monitor (PADCrashMonitor, "Power Automate crash monitor service") - a
# bare 'Power Automate*' wildcard matched that first on MHS-SYD-APP47 (1 Sep 2026).
$candidates = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'PADCrashMonitor' -and $_.DisplayName -notlike '*crash monitor*' })
$service = $candidates | Where-Object { $_.Name -eq 'UIFlowService' } | Select-Object -First 1
if (-not $service) { $service = $candidates | Where-Object { $_.DisplayName -eq 'Power Automate Service' } | Select-Object -First 1 }
if (-not $service) { $service = $candidates | Where-Object { $_.DisplayName -like 'Power Automate*' } | Select-Object -First 1 }
if (-not $service) {
    Exit-WithCode 4 'Power Automate runtime service not found (expected name UIFlowService / display "Power Automate Service")'
}
Write-Log ('service {0} ("{1}") status before={2}' -f $service.Name, $service.DisplayName, $service.Status)

try {
    Restart-Service -Name $service.Name -Force -ErrorAction Stop
} catch {
    Write-Log ('WARN Restart-Service threw: {0} - falling back to Stop/Start' -f $_.Exception.Message)
    Stop-Service -Name $service.Name -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    Start-Service -Name $service.Name -ErrorAction SilentlyContinue
}

$svcDeadline = (Get-Date).AddSeconds(60)
do {
    Start-Sleep -Seconds 3
    $service.Refresh()
} while ($service.Status -ne 'Running' -and (Get-Date) -lt $svcDeadline)
Write-Log ('service {0} status after={1}' -f $service.Name, $service.Status)
if ($service.Status -ne 'Running') {
    Exit-WithCode 5 'service did not reach Running within 60 s'
}

# ---- 5. Optional smoke run ------------------------------------------------
if (-not $SmokeRun) {
    Exit-WithCode 0 'restart complete (no smoke run requested)'
}

try {
    Start-ScheduledTask -TaskName $FlowTaskName -ErrorAction Stop
    Write-Log ('smoke: started task "{0}"' -f $FlowTaskName)
} catch {
    Exit-WithCode 3 ('smoke: could not start task "{0}": {1}' -f $FlowTaskName, $_.Exception.Message)
}

$smokeDeadline = (Get-Date).AddSeconds(90)
$consoleUp = $false
$newLog = $null
do {
    Start-Sleep -Seconds 5
    if (Get-Process -Name 'PAD.Console.Host' -ErrorAction SilentlyContinue) { $consoleUp = $true }
    if (Test-Path -LiteralPath $RunLogDir) {
        $newLog = Get-ChildItem -LiteralPath $RunLogDir -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -gt $restartedAt } |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
    }
} while (-not ($consoleUp -and $newLog) -and (Get-Date) -lt $smokeDeadline)

Write-Log ('smoke: consoleUp={0} newRunLog={1}' -f $consoleUp, $(if ($newLog) { $newLog.Name } else { '<none>' }))
if ($consoleUp -and $newLog) {
    Exit-WithCode 0 'SMOKE PASS'
}
Exit-WithCode 3 'SMOKE FAIL - console did not relaunch or no new run log within 90 s'
