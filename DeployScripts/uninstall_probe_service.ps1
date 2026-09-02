<#
.SYNOPSIS
    One-click uninstaller for the SinoAI Agent Probe Windows service.

.DESCRIPTION
    Removes the AgentProbe service (delegating to install_probe_service.ps1
    -Action uninstall, which also handles legacy NSSM services) and then
    cleans up the install directory (C:\SinoAI\AgentProbe by default).
    Re-elevates itself through UAC when the current session is not running
    as administrator, so end users can just right-click -> "Run with
    PowerShell" without thinking about privileges.

    Idempotent: when the service is not installed it skips the removal and
    only reports the missing service (leftover files are still offered for
    cleanup).

.PARAMETER ServiceName
    Name of the service to remove. Defaults to "AgentProbe".

.PARAMETER InstallDir
    Directory created by the installer to clean up. Defaults to
    "C:\SinoAI\AgentProbe".

.PARAMETER KeepFiles
    Uninstall the service but keep the install directory (logs, config,
    WinSW wrapper) for inspection.

.PARAMETER Force
    Skip the confirmation prompt before deleting the install directory and
    the "press Enter to close" pause at the end (non-interactive / scripted
    use).

.EXAMPLE
    # One-click uninstall with cleanup (prompts before deleting files)
    powershell -ExecutionPolicy Bypass -File uninstall_probe_service.ps1

.EXAMPLE
    # Uninstall, keep logs/config, no prompts
    powershell -ExecutionPolicy Bypass -File uninstall_probe_service.ps1 -KeepFiles

.EXAMPLE
    # Uninstall and delete everything without asking (scripted use)
    powershell -ExecutionPolicy Bypass -File uninstall_probe_service.ps1 -Force
#>
[CmdletBinding()]
param(
    [string]$ServiceName = "AgentProbe",
    [string]$InstallDir = "C:\SinoAI\AgentProbe",
    [switch]$KeepFiles,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step {
    param([string]$Message)
    Write-Host "[uninstall_probe_service] $Message" -ForegroundColor Cyan
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[uninstall_probe_service] ERROR: $Message" -ForegroundColor Red
}

function Test-IsAdmin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Restart-AsAdmin {
    # Re-launch this very script elevated with the same parameters. UAC
    # prompts once; the elevated window is the one doing the actual work.
    $hostPath = (Get-Process -Id $PID).Path
    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($ServiceName -ne "AgentProbe") { $argLine += " -ServiceName `"$ServiceName`"" }
    if ($InstallDir -ne "C:\SinoAI\AgentProbe") { $argLine += " -InstallDir `"$InstallDir`"" }
    if ($KeepFiles) { $argLine += " -KeepFiles" }
    if ($Force) { $argLine += " -Force" }
    Write-Step "Not running as administrator; re-launching elevated (accept the UAC prompt)..."
    try {
        Start-Process -FilePath $hostPath -Verb RunAs -ArgumentList $argLine
    }
    catch {
        Write-Fail "Elevation was declined. Re-run this script as administrator instead."
        exit 1
    }
    exit 0
}

function Invoke-UninstallService {
    # Delegate to the proven uninstall logic (WinSW uninstall with fallback
    # to sc delete for legacy NSSM services) in a child process:
    # install_probe_service.ps1 ends with `exit 0`, which would otherwise
    # terminate the current session too.
    $helper = Join-Path $PSScriptRoot "install_probe_service.ps1"
    if (-not (Test-Path $helper)) {
        throw "install_probe_service.ps1 not found next to this script: $helper"
    }
    $hostExe = if ($PSVersionTable.PSEdition -eq 'Core') { 'pwsh' } else { 'powershell' }
    & $hostExe -NoProfile -ExecutionPolicy Bypass -File $helper `
        -Action uninstall -ServiceName $ServiceName
    if ($LASTEXITCODE -ne 0) {
        throw "install_probe_service.ps1 -Action uninstall failed with exit code $LASTEXITCODE"
    }
}

function Remove-InstallDir {
    # Delete leftover files (WinSW wrapper, config, logs, agent script).
    # Runs after the service is gone, so the wrapper exe is no longer locked;
    # failures on individual stubborn files are tolerated and reported.
    if (-not (Test-Path $InstallDir)) {
        Write-Step "Install directory not present: $InstallDir (nothing to clean)"
        return
    }
    if (-not $KeepFiles) {
        if (-not $Force) {
            $answer = Read-Host "Delete the install directory '$InstallDir'? [y/N]"
            if ($answer -notmatch '^(y|yes)$') {
                Write-Step "Keeping install directory: $InstallDir"
                return
            }
        }
        Write-Step "Removing install directory: $InstallDir"
        Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $InstallDir) {
            Write-Fail "Some files could not be removed (locked?): $InstallDir"
        }
        else {
            Write-Step "Install directory removed: $InstallDir"
        }
    }
    else {
        Write-Step "Keeping install directory (-KeepFiles): $InstallDir"
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# 1. Elevate when needed (service management requires an admin session).
if (-not (Test-IsAdmin)) {
    Restart-AsAdmin
}

Write-Step "Uninstalling probe service '$ServiceName'"

# 2. Remove the service (idempotent: fine when it is not installed).
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Invoke-UninstallService
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        throw "Service '$ServiceName' still present after uninstall"
    }
    Write-Host "SERVICE_REMOVED: $ServiceName"
}
else {
    Write-Step "Service '$ServiceName' is not installed; skipping removal"
}

# 3. Clean up the install directory (unless -KeepFiles).
Remove-InstallDir

Write-Host "UNINSTALL_OK: $ServiceName"

# Keep the console window open for interactive runs so the user can read the
# result; scripted runs pass -Force to skip the pause.
if (-not $Force -and $Host.Name -eq 'ConsoleHost') {
    Read-Host "Press Enter to close"
}
exit 0
