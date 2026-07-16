# Login to Dify and extract csrf_token to rest-client.env.json
# Reads credentials from config/config.json (single source of truth)

$rootDir = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $rootDir "config" "config.json"
$envFile = Join-Path $PSScriptRoot "rest-client.env.json"

# Read config
if (-not (Test-Path $configFile)) {
    Write-Host "Config file not found: $configFile" -ForegroundColor Red
    Write-Host "Copy config.json.example to config.json and fill in your credentials." -ForegroundColor Yellow
    exit 1
}

$config = Get-Content $configFile -Raw | ConvertFrom-Json
$difyUrl = $config.difyUrl -replace '/$', ''  # Remove trailing slash
$email = $config.difyConsole.email
$password = $config.difyConsole.password

Write-Host "Logging in to $difyUrl as $email ..."

# Call login API and capture response headers
$body = @{ email = $email; password = $password; language = "zh-Hans"; remember_me = $true } | ConvertTo-Json
$headers = curl.exe -s -D - -o NUL "$difyUrl/console/api/login" `
    -H "Content-Type: application/json" `
    -d $body `
    --insecure 2>&1

# Extract csrf_token from Set-Cookie header
$csrfToken = ""
foreach ($line in $headers) {
    if ($line -match 'csrf_token=([^;]+)') {
        $csrfToken = $Matches[1]
        break
    }
}

if ($csrfToken) {
    $json = "{`n  `"`$shared`": {`n    `"csrf_token`": `"$csrfToken`"`n  }`n}"
    [System.IO.File]::WriteAllText($envFile, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host "csrf_token updated successfully: $($csrfToken.Substring(0, 20))..." -ForegroundColor Green
}
else {
    Write-Host "Failed to extract csrf_token from login response." -ForegroundColor Red
    Write-Host "Response headers:"
    $headers | ForEach-Object { Write-Host $_ }
}
# Login to Dify and extract csrf_token to rest-client.env.json
$bodyFile = Join-Path $PSScriptRoot "login_body.json"
$envFile = Join-Path $PSScriptRoot "rest-client.env.json"

# Write login body to temp file
[System.IO.File]::WriteAllText($bodyFile, '{"email":"tengfei.ma@sinounion.com","password":"bWV0MTk4NzQyOX4=","language":"zh-Hans","remember_me":true}', [System.Text.UTF8Encoding]::new($false))

# Call login API and capture response headers
$dataArg = "@$bodyFile"
$headers = curl.exe -s -D - -o NUL "http://10.10.9.65/console/api/login" `
    -H "Content-Type: application/json" `
    -d $dataArg `
    --insecure 2>&1

# Extract csrf_token from Set-Cookie header
$csrfToken = ""
foreach ($line in $headers) {
    if ($line -match 'csrf_token=([^;]+)') {
        $csrfToken = $Matches[1]
        break
    }
}

if ($csrfToken) {
    $json = "{`n  `"`$shared`": {`n    `"csrf_token`": `"$csrfToken`"`n  }`n}"
    [System.IO.File]::WriteAllText($envFile, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host "csrf_token updated successfully: $($csrfToken.Substring(0, 20))..." -ForegroundColor Green
}
else {
    Write-Host "Failed to extract csrf_token from login response." -ForegroundColor Red
    Write-Host "Response headers:"
    $headers | ForEach-Object { Write-Host $_ }
}
