<#
.SYNOPSIS
    Install / update / uninstall / restart / status the is-busy.py probe agent
    as a Windows service via NSSM.

.DESCRIPTION
    The probe agent (DebugTools/is-busy.py) runs headless on every Jenkins
    agent / test machine and reports heartbeat + idle status to the SinoAI
    backend (POST /api/test-machines/probe). This script wraps it in an NSSM
    service with:
      - auto-start at boot
      - automatic restart on crash (AppExit Default Restart + 5s delay)
      - rotating stdout/stderr logs under <InstallDir>\logs
      - all PROBE_* settings injected via AppEnvironmentExtra

    Designed to be called from the Jenkinsfile.agent-probe pipeline for
    batch deployment across many agents. Never prints the probe token.

.EXAMPLE
    # One-shot install with full pipeline verification (--once round trip)
    powershell -ExecutionPolicy Bypass -File install_probe_service.ps1 `
        -Action install -ServerUrl http://10.10.9.65:8000/api/test-machines/probe `
        -Token $env:PROBE_TOKEN
#>
[CmdletBinding()]
param(
    [ValidateSet("install", "update", "uninstall", "restart", "status")]
    [string]$Action = "install",

    # Full probe endpoint URL, e.g. http://<backend>:8000/api/test-machines/probe
    [string]$ServerUrl = "",

    # Shared probe token; falls back to $env:PROBE_TOKEN (Jenkins credentials).
    [string]$Token = "",

    # Reported hostname; defaults to the local machine name.
    [string]$AgentName = "",

    [int]$IntervalSec = 30,
    [int]$IdleThresholdSec = 300,
    [int]$TickSec = 10,

    # Full path to python.exe. Auto-detected (py -3 / python) when empty.
    [string]$PythonPath = "",

    [string]$ServiceName = "AgentProbe",
    [string]$InstallDir = "C:\SinoAI\AgentProbe",

    # Optional URL to download nssm.zip from when nssm.exe is not on PATH.
    [string]$NssmUrl = "",

    # Optional override for the agent source script (default: repo DebugTools/is-busy.py).
    [string]$SourceScript = ""
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step {
    param([string]$Message)
    Write-Host "[install_probe_service] $Message" -ForegroundColor Cyan
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[install_probe_service] ERROR: $Message" -ForegroundColor Red
}

function Invoke-Checked {
    <#
    Run a native command and throw when it exits non-zero.
    Note: native stderr must not become a terminating error under
    ErrorActionPreference 'Stop' (PowerShell 5.1 wraps it as
    NativeCommandError), so probe with EAP temporarily relaxed and
    decide purely on $LASTEXITCODE.
    #>
    param([scriptblock]$Script, [string]$What)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Script
    }
    finally {
        $ErrorActionPreference = $prevEAP
    }
    if ($LASTEXITCODE -ne 0) {
        throw "$What failed with exit code $LASTEXITCODE"
    }
}

function Resolve-Python {
    <#
    Locate python.exe and pythonw.exe. When -PythonPath is empty, try
    `py -3` first (Windows launcher), then `python` on PATH.
    #>
    $candidates = @()
    if ($PythonPath) {
        $candidates += $PythonPath
    }
    else {
        # Probe py/python without letting native stderr (e.g. "No installed
        # Python found!") become a terminating error under ErrorActionPreference
        # 'Stop', which would skip the fallback to `python` on PATH.
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $pyLauncher = (& py -3 -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1)
            if ($pyLauncher -and (Test-Path $pyLauncher)) {
                $candidates += $pyLauncher
            }
            $pyOnPath = (& python -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1)
            if ($pyOnPath -and (Test-Path $pyOnPath)) {
                $candidates += $pyOnPath
            }
        }
        finally {
            $ErrorActionPreference = $prevEAP
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return [pscustomobject]@{
                Python   = $candidate
                PythonW  = Join-Path (Split-Path $candidate) "pythonw.exe"
                IsPythonW = Test-Path (Join-Path (Split-Path $candidate) "pythonw.exe")
            }
        }
    }
    throw "Could not locate python.exe. Pass -PythonPath or install Python 3."
}

function Ensure-PyWin32 {
    param([string]$Python)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Python -c "import win32ts" 2>$null
    }
    finally {
        $ErrorActionPreference = $prevEAP
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Step "pywin32 not importable; installing via pip"
        Invoke-Checked -Script { & $Python -m pip install pywin32 } -What "pip install pywin32"
    }
}

function Get-RegisteredNssm {
    <#
    Read the nssm.exe path the service was registered with (service ImagePath).
    Reusing the exact same binary on update avoids "Can't open service!" when a
    different nssm copy tries to open the existing service.
    #>
    param([string]$Svc)
    if (-not $Svc) { return "" }
    try {
        $imagePath = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$Svc" -Name ImagePath -ErrorAction Stop).ImagePath
        if (-not $imagePath) { return "" }
        # Quoted form: "C:\path\nssm.exe" nssm service <name>
        if ($imagePath -match '"([^"]+\.exe)"') { return $Matches[1] }
        # Unquoted form: C:\path\nssm.exe nssm service <name>
        $first = ($imagePath -split "\s+")[0]
        if ($first) { return $first }
    }
    catch { }
    return ""
}

function Get-PeMachine {
    <#
    Read the PE Machine field of an exe file: 0x8664 = x64, 0x14C = x86.
    Architecture is decided from the binary itself, never from folder names.
    #>
    param([string]$Path)
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        try {
            $br = New-Object System.IO.BinaryReader($fs)
            $fs.Seek(0x3C, [System.IO.SeekOrigin]::Begin) | Out-Null
            $peOffset = $br.ReadInt32()
            $fs.Seek($peOffset + 4, [System.IO.SeekOrigin]::Begin) | Out-Null
            return $br.ReadUInt16()
        }
        finally {
            $fs.Close()
        }
    }
    catch {
        return 0
    }
}

function Get-NssmFileInfo {
    param([string]$Path)
    $arch = switch (Get-PeMachine $Path) {
        0x8664 { "x64" }
        0x14C  { "x86" }
        default { "unknown-arch" }
    }
    $ver = (Get-Item $Path).VersionInfo.FileVersion
    return "$arch v$ver"
}

function Resolve-Nssm {
    <#
    Find nssm.exe, in priority order: the copy the service was registered
    with (keeps the same binary on update), <InstallDir>\nssm.exe, PATH, or
    download from -NssmUrl. The download is verified to be a real 64-bit
    binary by its PE header, so the archive layout never matters.
    #>
    param([string]$Svc)
    $resolved = ""
    if ($Svc) {
        $registered = Get-RegisteredNssm -Svc $Svc
        if ($registered -and (Test-Path $registered)) {
            $resolved = $registered
        }
    }
    if (-not $resolved) {
        $local = Join-Path $InstallDir "nssm.exe"
        if (Test-Path $local) {
            $resolved = $local
        }
    }
    if (-not $resolved) {
        $onPath = Get-Command nssm.exe -ErrorAction SilentlyContinue
        if ($onPath) {
            $resolved = $onPath.Source
        }
    }
    if (-not $resolved -and $NssmUrl) {
        Write-Step "Downloading NSSM from $NssmUrl"
        $zip = Join-Path $env:TEMP "nssm.zip"
        Invoke-WebRequest -Uri $NssmUrl -OutFile $zip -UseBasicParsing
        $extract = Join-Path $env:TEMP "nssm-extract"
        if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
        Expand-Archive -Path $zip -DestinationPath $extract
        # Skip obvious 32-bit folders, then verify the PE Machine field so a
        # mirror with a different archive layout still yields a true x64 copy.
        $candidates = Get-ChildItem -Path $extract -Filter nssm.exe -Recurse |
            Where-Object { $_.FullName -notmatch "\\win32(\\|$)" }
        $nssmExe = $candidates |
            Where-Object { (Get-PeMachine $_.FullName) -eq 0x8664 } |
            Select-Object -First 1
        if (-not $nssmExe) {
            throw "No 64-bit nssm.exe inside $NssmUrl archive (verified by PE header)"
        }
        Copy-Item $nssmExe.FullName $local -Force
        $resolved = $local
    }
    if (-not $resolved) {
        throw "nssm.exe not found on PATH or in $InstallDir. Pass -NssmUrl or place nssm.exe on PATH."
    }
    Write-Step "Using nssm: $resolved ($(Get-NssmFileInfo $resolved))"
    return $resolved
}

function Set-ServiceEnvironment {
    <#
    (Re)apply the full PROBE_* environment to the NSSM service.
    Called by both install and update so the env always matches the
    current parameters.
    #>
    param(
        [string]$Nssm,
        [string]$Svc,
        [string]$Server,
        [string]$ProbeToken,
        [string]$Agent,
        [string]$LogsDir
    )
    $envExtra = @(
        "PROBE_SERVER_URL=$Server",
        "PROBE_TOKEN=$ProbeToken",
        "PROBE_INTERVAL_SEC=$IntervalSec",
        "PROBE_IDLE_THRESHOLD_SEC=$IdleThresholdSec",
        "PROBE_TICK_SEC=$TickSec",
        "PROBE_MACHINE_NAME=$Agent",
        "PROBE_MACHINE_IP=",
        "PROBE_LOG_FILE="
    ) -join "`r`n"

    Invoke-Checked -Script { & $Nssm set $Svc AppEnvironmentExtra $envExtra } -What "nssm set AppEnvironmentExtra"
    Invoke-Checked -Script { & $Nssm set $Svc AppStdout (Join-Path $LogsDir "probe.out.log") } -What "nssm set AppStdout"
    Invoke-Checked -Script { & $Nssm set $Svc AppStderr (Join-Path $LogsDir "probe.err.log") } -What "nssm set AppStderr"
    Invoke-Checked -Script { & $Nssm set $Svc AppRotateFiles 1 } -What "nssm set AppRotateFiles"
    Invoke-Checked -Script { & $Nssm set $Svc AppRotateBytes 1048576 } -What "nssm set AppRotateBytes"
    Invoke-Checked -Script { & $Nssm set $Svc AppExit Default Restart } -What "nssm set AppExit"
    Invoke-Checked -Script { & $Nssm set $Svc AppRestartDelay 5000 } -What "nssm set AppRestartDelay"
    Invoke-Checked -Script { & $Nssm set $Svc AppDirectory $InstallDir } -What "nssm set AppDirectory"
}

function Test-OnceRoundTrip {
    <#
    Run `is-busy.py --once` with the same env the service will use and
    print the backend receipt. Fails the script when the round trip fails.
    #>
    param(
        [string]$Python,
        [string]$ScriptPath,
        [string]$Server,
        [string]$ProbeToken,
        [string]$Agent
    )
    $env:PROBE_SERVER_URL = $Server
    $env:PROBE_TOKEN = $ProbeToken
    $env:PROBE_MACHINE_NAME = $Agent
    $env:PROBE_IDLE_THRESHOLD_SEC = "$IdleThresholdSec"
    Write-Step "Verifying round trip: is-busy.py --once -> $Server"
    & $Python $ScriptPath --once
    if ($LASTEXITCODE -ne 0) {
        throw "--once round trip failed (exit code $LASTEXITCODE); backend unreachable or token rejected"
    }
}

function Get-ServiceState {
    param([string]$Svc)
    # Note: never name the local variable like the parameter ($Svc) —
    # PowerShell variables are case-insensitive, so the assignment would
    # overwrite the parameter and make $result.Status null.
    $result = Get-Service -Name $Svc -ErrorAction SilentlyContinue
    if ($result) { return $result.Status.ToString() }
    return "NOT_FOUND"
}

function Repair-ServiceImagePath {
    <#
    nssm services must be launched as "<nssm.exe>" nssm service <name>.
    A bare ImagePath (stripped by security tools or manual edits) makes the
    service exit immediately on start and makes nssm set/get fail. Restore
    the full command line when the 'nssm service' marker is missing.
    #>
    param([string]$Svc, [string]$Nssm)
    try {
        $imagePath = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$Svc" -Name ImagePath -ErrorAction Stop).ImagePath
        if (-not $imagePath) { return }
        if ($imagePath -match "\bnssm service\b") { return }
        Write-Step "Service '$Svc' ImagePath is missing 'nssm service' arguments; repairing it"
        $binPath = "`"$Nssm`" nssm service $Svc"
        & sc.exe config $Svc "binPath= $binPath" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "sc.exe config failed to repair ImagePath (exit code $LASTEXITCODE)"
        }
        Write-Step "ImagePath repaired: $binPath"
    }
    catch {
        Write-Fail "Failed to inspect/repair service ImagePath: $($_.Exception.Message)"
        throw
    }
}

function Assert-Admin {
    <#
    nssm install/set/start/remove all OpenService() the target service with
    SERVICE_ALL_ACCESS, which fails with "Can't open service!" when the
    current process is not running as an administrator. Fail early with an
    actionable message instead of a cryptic native error.
    #>
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Current process is not running as administrator. The Jenkins agent service must run with an administrator account to manage service '$ServiceName' (nssm would fail with 'Can't open service! / access denied')."
    }
}

# ---------------------------------------------------------------------------
# Resolve common inputs
# ---------------------------------------------------------------------------

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SourceScript) {
    $SourceScript = Join-Path (Join-Path $scriptDir "..") "DebugTools\is-busy.py"
}
if (-not (Test-Path $SourceScript)) {
    throw "Agent source script not found: $SourceScript"
}
if (-not $AgentName) {
    $AgentName = $env:COMPUTERNAME
}
# Token and ServerUrl are only required by actions that register/verify the
# agent (install/update); status/restart/uninstall just touch the service.
if ($Action -in @("install", "update")) {
    if (-not $Token) {
        $Token = $env:PROBE_TOKEN
    }
    if (-not $Token) {
        throw "No probe token provided. Pass -Token or set PROBE_TOKEN (Jenkins credentials)."
    }
    if (-not $ServerUrl) {
        throw "ServerUrl is required for action '$Action' (e.g. http://<backend>:8000/api/test-machines/probe)"
    }
}

$logsDir = Join-Path $InstallDir "logs"

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

switch ($Action) {
    "status" {
        $state = Get-ServiceState $ServiceName
        Write-Host "SERVICE_STATE: $state"
        if ($state -ne "NOT_FOUND") {
            sc.exe query $ServiceName
        }
        break
    }

    "uninstall" {
        Assert-Admin
        $state = Get-ServiceState $ServiceName
        if ($state -eq "NOT_FOUND") {
            Write-Step "Service '$ServiceName' not installed; nothing to do"
            break
        }
        $nssm = Resolve-Nssm -Svc $ServiceName
        Repair-ServiceImagePath -Svc $ServiceName -Nssm $nssm
        if ($state -eq "Running") {
            Write-Step "Stopping service '$ServiceName'"
            Invoke-Checked -Script { & $nssm stop $ServiceName } -What "nssm stop"
        }
        Write-Step "Removing service '$ServiceName'"
        Invoke-Checked -Script { & $nssm remove $ServiceName confirm } -What "nssm remove"
        Write-Host "SERVICE_REMOVED: $ServiceName"
        break
    }

    "restart" {
        Assert-Admin
        $state = Get-ServiceState $ServiceName
        if ($state -eq "NOT_FOUND") {
            throw "Service '$ServiceName' is not installed; run with -Action install first"
        }
        $nssm = Resolve-Nssm -Svc $ServiceName
        Repair-ServiceImagePath -Svc $ServiceName -Nssm $nssm
        Invoke-Checked -Script { & $nssm restart $ServiceName } -What "nssm restart"
        Write-Host "SERVICE_STATE: $(Get-ServiceState $ServiceName)"
        break
    }

    "install" {
        Assert-Admin
        if ((Get-ServiceState $ServiceName) -ne "NOT_FOUND") {
            Write-Step "Service '$ServiceName' already exists; running as update"
            & $MyInvocation.MyCommand.Path -Action update -ServerUrl $ServerUrl -Token $Token `
                -AgentName $AgentName -IntervalSec $IntervalSec -IdleThresholdSec $IdleThresholdSec `
                -TickSec $TickSec -PythonPath $PythonPath -ServiceName $ServiceName `
                -InstallDir $InstallDir -NssmUrl $NssmUrl -SourceScript $SourceScript
            exit $LASTEXITCODE
        }

        Write-Step "Installing probe agent service '$ServiceName' into $InstallDir"

        # 1. Prepare install dir and copy the agent script.
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
        Copy-Item $SourceScript (Join-Path $InstallDir "is-busy.py") -Force

        # 2. Resolve python (with pywin32) and nssm.
        $py = Resolve-Python
        Write-Step "Using python: $($py.Python)"
        Ensure-PyWin32 $py.Python
        $nssm = Resolve-Nssm

        # 3. Register the service (pythonw headless).
        $agentScript = Join-Path $InstallDir "is-busy.py"
        Invoke-Checked -Script { & $nssm install $ServiceName $py.PythonW $agentScript } -What "nssm install"

        # 4. Inject environment + logging + crash-restart policy.
        try {
            Set-ServiceEnvironment -Nssm $nssm -Svc $ServiceName -Server $ServerUrl `
                -ProbeToken $Token -Agent $AgentName -LogsDir $logsDir
        }
        catch {
            Write-Fail "Service config update failed: $($_.Exception.Message)"
            Write-Fail "Diagnostics: nssm=$nssm. Run 'sc.exe qc $ServiceName' on the agent and verify the ImagePath. If nssm reports 'Can't open service! / access denied', the process is not running with administrator rights."
            throw
        }

        # 5. Start and confirm.
        Invoke-Checked -Script { & $nssm start $ServiceName } -What "nssm start"
        $state = Get-ServiceState $ServiceName
        Write-Host "SERVICE_STATE: $state"
        if ($state -ne "Running") {
            throw "Service '$ServiceName' did not reach Running state (state=$state)"
        }

        # 6. Full-chain verification: one-shot report must be accepted by backend.
        Test-OnceRoundTrip -Python $py.Python -ScriptPath $agentScript `
            -Server $ServerUrl -ProbeToken $Token -Agent $AgentName
        Write-Host "INSTALL_OK: $ServiceName"
        break
    }

    "update" {
        Assert-Admin
        if ((Get-ServiceState $ServiceName) -eq "NOT_FOUND") {
            Write-Step "Service '$ServiceName' not installed; falling back to install"
            & $MyInvocation.MyCommand.Path -Action install -ServerUrl $ServerUrl -Token $Token `
                -AgentName $AgentName -IntervalSec $IntervalSec -IdleThresholdSec $IdleThresholdSec `
                -TickSec $TickSec -PythonPath $PythonPath -ServiceName $ServiceName `
                -InstallDir $InstallDir -NssmUrl $NssmUrl -SourceScript $SourceScript
            exit $LASTEXITCODE
        }

        Write-Step "Updating probe agent service '$ServiceName'"

        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
        Copy-Item $SourceScript (Join-Path $InstallDir "is-busy.py") -Force

        $py = Resolve-Python
        $nssm = Resolve-Nssm -Svc $ServiceName
        Repair-ServiceImagePath -Svc $ServiceName -Nssm $nssm
        try {
            Set-ServiceEnvironment -Nssm $nssm -Svc $ServiceName -Server $ServerUrl `
                -ProbeToken $Token -Agent $AgentName -LogsDir $logsDir
        }
        catch {
            Write-Fail "Service config update failed: $($_.Exception.Message)"
            Write-Fail "Diagnostics: nssm=$nssm. Run 'sc.exe qc $ServiceName' on the agent and verify the ImagePath. If nssm reports 'Can't open service! / access denied', the process is not running with administrator rights."
            throw
        }

        Invoke-Checked -Script { & $nssm restart $ServiceName } -What "nssm restart"
        Write-Host "SERVICE_STATE: $(Get-ServiceState $ServiceName)"

        Test-OnceRoundTrip -Python $py.Python -ScriptPath (Join-Path $InstallDir "is-busy.py") `
            -Server $ServerUrl -ProbeToken $Token -Agent $AgentName
        Write-Host "UPDATE_OK: $ServiceName"
        break
    }
}

exit 0
