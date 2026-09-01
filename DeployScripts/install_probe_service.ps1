<#
.SYNOPSIS
    Install / update / uninstall / restart / status the is-busy.py probe agent
    as a Windows service via WinSW.

.DESCRIPTION
    The probe agent (DebugTools/is-busy.py) runs headless on every Jenkins
    agent / test machine and reports heartbeat + idle status to the SinoAI
    backend (POST /api/test-machines/probe). This script wraps it in a WinSW
    service with:
      - auto-start at boot (startmode Automatic)
      - automatic restart on crash (onfailure restart, 5s delay)
      - rotating stdout/stderr logs under <InstallDir>\logs
      - all PROBE_* settings injected via <env> entries in the WinSW config

    WinSW is used instead of NSSM on purpose: `nssm install` intermittently
    fails with exit code 6 (ERROR_INVALID_HANDLE) when run non-interactively
    from a service session (the Jenkins agent), even though it succeeds in an
    elevated interactive console. WinSW's `install` uses the plain SCM API and
    is already proven on these exact machines by the Jenkins agent service.

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

    # WinSW wrapper binary name (agent-probe.exe + matching agent-probe.xml).
    # WinSW always looks for the XML config with the same base name next to it.
    [string]$WrapperName = "agent-probe",

    # WinSW wrapper source: http(s) URL (GitHub release) or UNC path on the
    # internal LAN share (preferred: much faster, no external dependency).
    [string]$WinswUrl = "\\10.10.11.31\SoftwareDev\tengfei\Jenkins\WinSW-x64.exe",

    # Optional domain credentials for the LAN share, used when the account
    # running this script has no access to it. Password falls back to
    # $env:SHARE_PASSWORD (injected by Jenkins Credentials Binding); never
    # hardcode secrets in this file.
    [string]$ShareUser = "",
    [string]$SharePassword = "",
    

    # DEPRECATED: kept only so existing `-NssmUrl` pipeline calls still bind.
    # Ignored now that the service is managed by WinSW.
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
    decide purely on $LASTEXITCODE. On failure, surface the captured
    output and exit code so the real native error is visible in the log.
    #>
    param([scriptblock]$Script, [string]$What)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Script 2>&1
    }
    finally {
        $ErrorActionPreference = $prevEAP
    }
    if ($LASTEXITCODE -ne 0) {
        if ($out) {
            foreach ($line in $out) { Write-Fail "$What output: $line" }
        }
        throw "$What failed with exit code $LASTEXITCODE"
    }
}

function ConvertTo-XmlText {
    param([string]$Value)
    if ($null -eq $Value) { return "" }
    ($Value -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' `
                   -replace '"', '&quot;' -replace "'", '&apos;')
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
                Python    = $candidate
                PythonW   = Join-Path (Split-Path $candidate) "pythonw.exe"
                IsPythonW = (Test-Path (Join-Path (Split-Path $candidate) "pythonw.exe"))
            }
        }
    }
    throw "Could not locate python.exe. Pass -PythonPath or install Python 3."
}

function Select-Interpreter {
    <#
    Prefer headless pythonw.exe, but ONLY when it really exists; otherwise
    fall back to python.exe. Hands the service a path that is guaranteed to
    be on disk, never a dangling pythonw.exe.
    #>
    param([pscustomobject]$Py)
    if ($Py.IsPythonW) {
        Write-Step "Using interpreter: $($Py.PythonW) (headless)"
        return $Py.PythonW
    }
    Write-Step "pythonw.exe not found; falling back to $($Py.Python)"
    if (-not (Test-Path $Py.Python)) {
        throw "Resolved interpreter not present on disk: $($Py.Python)"
    }
    return $Py.Python
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
        Invoke-Checked -Script { & $Python -m pip install --no-warn-script-location pywin32 } -What "pip install pywin32"
    }
}

function Resolve-Winsw {
    <#
    Ensure the WinSW wrapper binary is present at <InstallDir>\<WrapperName>.exe
    and return its full path. Reuse an existing copy; otherwise fetch x64
    from -WinswUrl. -WinswUrl may be an http(s) URL (Invoke-WebRequest) or a
    UNC path on the LAN share (Copy-Item; preferred because it avoids the
    slow GitHub download). The XML side-car (same base name) is always
    regenerated.
    #>
    $exe = Join-Path $InstallDir "$WrapperName.exe"
    if (-not (Test-Path $exe)) {
        if (-not $WinswUrl) {
            throw "WinSW not found at $exe and no -WinswUrl supplied. Place WinSW-x64.exe as $exe or pass -WinswUrl."
        }
        Write-Step "Fetching WinSW from $WinswUrl"
        try {
            if ($WinswUrl.StartsWith('\\')) {
                if ($ShareUser) {
                    # UNC path with explicit domain credentials: mount the
                    # share as a temp drive (SecureString, password never
                    # lands on the command line), copy, then drop the mapping.
                    if (-not $SharePassword) { $SharePassword = $env:SHARE_PASSWORD }
                    if (-not $SharePassword) {
                        throw "ShareUser '$ShareUser' provided but no password; pass -SharePassword or set SHARE_PASSWORD."
                    }
                    $shareRoot = ($WinswUrl -split '\\')[0..3] -join '\'
                    $rel = $WinswUrl.Substring($shareRoot.Length).TrimStart('\')
                    $secure = ConvertTo-SecureString $SharePassword -AsPlainText -Force
                    $cred = New-Object System.Management.Automation.PSCredential($ShareUser, $secure)
                    $drive = "Share$PID"
                    # Explicit -ErrorAction Stop: a bad credential is a
                    # non-terminating error and must not leave the function
                    # "succeeding" with a file that was never copied.
                    New-PSDrive -Name $drive -PSProvider FileSystem -Root $shareRoot -Credential $cred -ErrorAction Stop | Out-Null
                    try {
                        Copy-Item "$drive`:\$rel" $exe -Force -ErrorAction Stop
                    }
                    finally {
                        Remove-PSDrive $drive -Force -ErrorAction SilentlyContinue
                    }
                }
                else {
                    # UNC path with the current process credentials (the
                    # Jenkins agent runs as a domain account that usually
                    # already has read access to the share).
                    Copy-Item -Path $WinswUrl -Destination $exe -Force
                }
            }
            else {
                Invoke-WebRequest -Uri $WinswUrl -OutFile $exe -UseBasicParsing
            }
        }
        catch {
            throw "Failed to fetch WinSW from $WinswUrl : $($_.Exception.Message)"
        }
    }
    Write-Step "Using WinSW: $exe"
    return $exe
}

function New-ProbeXmlConfig {
    <#
    Build the WinSW service config for the probe and write it to
    <InstallDir>\<WrapperName>.xml (UTF-8, no BOM). Returns the xml path.
    All PROBE_* values are injected as <env> nodes; the token is embedded in
    the file (needed by the running service) but NEVER echoed to the log.
    #>
    param(
        [string]$WrapperExe,
        [string]$Interpreter,
        [string]$AgentScript,
        [string]$LogsDir,
        [string]$Server,
        [string]$ProbeToken,
        [string]$Agent
    )

    $svc       = ConvertTo-XmlText $ServiceName
    $escInterp = ConvertTo-XmlText $Interpreter
    $escScript = ConvertTo-XmlText $AgentScript
    $escWork   = ConvertTo-XmlText $InstallDir
    $escLogs   = ConvertTo-XmlText $LogsDir

    # sizeThreshold is in kilobytes -> 1024 KB ~ 1 MB per rotated log.
    $envNodes = @(
        @{ n = "PROBE_SERVER_URL";          v = $Server }
        @{ n = "PROBE_TOKEN";               v = $ProbeToken }
        @{ n = "PROBE_INTERVAL_SEC";        v = "$IntervalSec" }
        @{ n = "PROBE_IDLE_THRESHOLD_SEC";  v = "$IdleThresholdSec" }
        @{ n = "PROBE_TICK_SEC";            v = "$TickSec" }
        @{ n = "PROBE_MACHINE_NAME";        v = $Agent }
        @{ n = "PROBE_MACHINE_IP";          v = "" }
        @{ n = "PROBE_LOG_FILE";            v = "" }
    ) | ForEach-Object {
        '  <env name="{0}" value="{1}"/>' -f $_.n, (ConvertTo-XmlText $_.v)
    } | Out-String

@"
<!-- Generated by install_probe_service.ps1 - do not edit by hand. -->
<service>
  <id>$svc</id>
  <name>SinoAI Agent Probe ($svc)</name>
  <description>Heartbeat / idle probe agent reporting to the SinoAI backend.</description>

  <executable>$escInterp</executable>
  <arguments>"$escScript"</arguments>
  <workingdirectory>$escWork</workingdirectory>

$envNodes
  <logpath>$escLogs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>1024</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>

  <onfailure action="restart">
    <delay>5 sec</delay>
  </onfailure>
  <resetfailure>1 hour</resetfailure>

  <startmode>Automatic</startmode>
  <stoptimeout>15 sec</stoptimeout>
</service>
"@ | ForEach-Object { [IO.File]::WriteAllText((Join-Path $InstallDir "$WrapperName.xml"), $_, (New-Object System.Text.UTF8Encoding($false))) }

    return (Join-Path $InstallDir "$WrapperName.xml")
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

function Test-ServiceInstalled {
    param([string]$Svc)
    return ((Get-Service -Name $Svc -ErrorAction SilentlyContinue) -ne $null)
}

function Assert-Admin {
    # WinSW install/uninstall and sc operations OpenService / CreateService
    # with elevated rights; fail early with an actionable message.
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Current process is not running as administrator. The Jenkins agent service must run with an administrator account to manage service '$ServiceName' via WinSW."
    }
}

function Wait-ForServiceState {
    <#
    Poll until the service reaches one of -TargetStates or times out. A service
    can legitimately sit in StartPending while pythonw.exe boots, and WinSW's
    onfailure-restart may briefly cycle it, so a single Get-Service right after
    `start` is unreliable. Returns the last observed state.
    #>
    param(
        [string]$Svc,
        [string[]]$TargetStates = @("Running"),
        [int]$TimeoutSec = 45,
        [int]$PollSec = 3
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $s = Get-ServiceState $Svc
        if ($TargetStates -contains $s) { return $s }
        Start-Sleep -Seconds $PollSec
    }
    return (Get-ServiceState $Svc)
}

function Dump-ProbeLogs {
    # Print the tail of WinSW's wrapper/stdout/stderr logs so the reason for a
    # service that won't reach Running shows up right in the Jenkins console.
    $files = @(
        (Join-Path $logsDir "$WrapperName.wrapper.log"),
        (Join-Path $logsDir "$WrapperName.out.log"),
        (Join-Path $logsDir "$WrapperName.err.log")
    )
    foreach ($f in $files) {
        if (Test-Path $f) {
            Write-Host "----- tail $f -----" -ForegroundColor Yellow
            Get-Content $f -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        }
    }
}

function Install-ProbeService {
    Assert-Admin
    Write-Step "Installing probe agent service '$ServiceName' into $InstallDir"

    # 1. Prepare install dir and copy the agent script.
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Copy-Item $SourceScript (Join-Path $InstallDir "is-busy.py") -Force

    # 2. Resolve interpreter (with pywin32) and WinSW wrapper.
    $py = Resolve-Python
    Write-Step "Using python: $($py.Python)"
    Ensure-PyWin32 $py.Python
    $interpreter = Select-Interpreter $py
    $wrapper = Resolve-Winsw

    # 3. Write the (fresh) service config.
    $agentScript = Join-Path $InstallDir "is-busy.py"
    $xml = New-ProbeXmlConfig -WrapperExe $wrapper -Interpreter $interpreter -AgentScript $agentScript `
        -LogsDir $logsDir -Server $ServerUrl -ProbeToken $Token -Agent $AgentName
    Write-Step "Generated service config: $xml"

    # 4. Idempotent install: drop any prior registration, then install fresh so
    #    the just-written XML is what the SCM loads.
    if (Test-ServiceInstalled $ServiceName) {
        Write-Step "Service '$ServiceName' already exists; removing before reinstall"
        # stop/uninstall are best-effort here: a stopped service returns
        # non-zero from `stop`, and a legacy NSSM-created service is not always
        # removable by WinSW's uninstall, so fall back to `sc delete`.
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & $wrapper stop 2>&1 | Out-Null
        & $wrapper uninstall 2>&1 | Out-Null
        $ErrorActionPreference = $prevEAP
        if (Test-ServiceInstalled $ServiceName) {
            Write-Step "WinSW could not remove '$ServiceName' (likely a legacy NSSM service); using sc delete"
            $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            & sc.exe delete $ServiceName 2>&1 | Out-Null
            $ErrorActionPreference = $prevEAP
        }
        Start-Sleep -Seconds 2
    }
    Invoke-Checked -Script { & $wrapper install } -What "winsw install"

    # 5. Start and confirm (poll for Running; StartPending is transient).
    Invoke-Checked -Script { & $wrapper start } -What "winsw start"
    $state = Wait-ForServiceState -Svc $ServiceName -TargetStates @("Running") -TimeoutSec 45 -PollSec 3
    Write-Host "SERVICE_STATE: $state"
    if ($state -ne "Running") {
        Dump-ProbeLogs
        throw "Service '$ServiceName' did not reach Running within 45s (state=$state); see the log tails above / $logsDir\$WrapperName.wrapper.log"
    }

    # 6. Full-chain verification: one-shot report must be accepted by backend.
    Test-OnceRoundTrip -Python $py.Python -ScriptPath $agentScript `
        -Server $ServerUrl -ProbeToken $Token -Agent $AgentName
    Write-Host "INSTALL_OK: $ServiceName"
}

function Update-ProbeService {
    Assert-Admin
    if (-not (Test-ServiceInstalled $ServiceName)) {
        Write-Step "Service '$ServiceName' not installed; falling back to install"
        Install-ProbeService
        return
    }

    Write-Step "Updating probe agent service '$ServiceName'"
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Copy-Item $SourceScript (Join-Path $InstallDir "is-busy.py") -Force

    $py = Resolve-Python
    $interpreter = Select-Interpreter $py
    $wrapper = Resolve-Winsw
    $agentScript = Join-Path $InstallDir "is-busy.py"
    [void](New-ProbeXmlConfig -WrapperExe $wrapper -Interpreter $interpreter -AgentScript $agentScript `
        -LogsDir $logsDir -Server $ServerUrl -ProbeToken $Token -Agent $AgentName)

    # WinSW re-reads its XML on (re)start; restart applies the new config/env.
    Invoke-Checked -Script { & $wrapper restart } -What "winsw restart"
    $state = Wait-ForServiceState -Svc $ServiceName -TargetStates @("Running") -TimeoutSec 45 -PollSec 3
    Write-Host "SERVICE_STATE: $state"
    if ($state -ne "Running") {
        Dump-ProbeLogs
        throw "Service '$ServiceName' did not reach Running after restart within 45s (state=$state); see the log tails above / $logsDir\$WrapperName.wrapper.log"
    }

    Test-OnceRoundTrip -Python $py.Python -ScriptPath $agentScript `
        -Server $ServerUrl -ProbeToken $Token -Agent $AgentName
    Write-Host "UPDATE_OK: $ServiceName"
}

function Uninstall-ProbeService {
    Assert-Admin
    if (-not (Test-ServiceInstalled $ServiceName)) {
        Write-Step "Service '$ServiceName' not installed; nothing to do"
        return
    }
    $wrapper = Resolve-Winsw
    if ((Get-ServiceState $ServiceName) -eq "Running") {
        Write-Step "Stopping service '$ServiceName'"
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & $wrapper stop 2>&1 | Out-Null
        $ErrorActionPreference = $prevEAP
    }
    Write-Step "Removing service '$ServiceName'"
    Invoke-Checked -Script { & $wrapper uninstall } -What "winsw uninstall"
    Write-Host "SERVICE_REMOVED: $ServiceName"
}

function Restart-ProbeService {
    Assert-Admin
    if (-not (Test-ServiceInstalled $ServiceName)) {
        throw "Service '$ServiceName' is not installed; run with -Action install first"
    }
    $wrapper = Resolve-Winsw
    Invoke-Checked -Script { & $wrapper restart } -What "winsw restart"
    Write-Host "SERVICE_STATE: $(Get-ServiceState $ServiceName)"
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
    }
    "install"   { Install-ProbeService }
    "update"    { Update-ProbeService }
    "uninstall" { Uninstall-ProbeService }
    "restart"   { Restart-ProbeService }
}

exit 0
