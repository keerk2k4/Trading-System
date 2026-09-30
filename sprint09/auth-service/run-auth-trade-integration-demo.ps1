param(
  [string]$AuthBaseUrl = "http://localhost:3000",
  [string]$Username = "TheOnlyJohn",
  [string]$Password = "johnbelongstoswag",
  [string]$TimingUsername = "TheOnlyJohnXD",
  [string]$AuthDbUrl = "postgresql://postgres:n3u3d4!@localhost:5432/trading_system"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host ""
  Write-Host "==== $Message ====" -ForegroundColor Cyan
  Write-Host ""
}

function Format-JsonOutput {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $Text
  }

  try {
    return ($Text | ConvertFrom-Json | ConvertTo-Json -Depth 20)
  }
  catch {
    return $Text
  }
}

function Write-JsonBody {
  param(
    [string]$Label,
    [string]$Content,
    [int]$StatusCode
  )

  $color = "DarkCyan"
  if ($StatusCode -ge 400) {
    $color = "Yellow"
  }

  Write-Host "${Label}:"
  Write-Host (Format-JsonOutput -Text $Content) -ForegroundColor $color
  Write-Host ""
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Body,
    [hashtable]$Headers
  )

  $jsonBody = $null
  if ($Body) {
    $jsonBody = $Body | ConvertTo-Json -Depth 5
  }

  $requestHeaders = @{}
  if ($Headers) {
    $requestHeaders = $Headers
  }

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $invokeParams = @{
      Uri         = $Url
      Method      = $Method
      Headers     = $requestHeaders
      ErrorAction = "Stop"
    }

    if ($Body) {
      $invokeParams.ContentType = "application/json"
      $invokeParams.Body = $jsonBody
    }

    $response = Invoke-WebRequest @invokeParams
    $stopwatch.Stop()

    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Content = $response.Content
      ElapsedMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 2)
    }
  }
  catch [System.Net.WebException] {
    $stopwatch.Stop()

    if ($_.Exception.Response -ne $null) {
      $httpResponse = [System.Net.HttpWebResponse]$_.Exception.Response
      $content = ""

      if ($_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
        $content = $_.ErrorDetails.Message
      }

      if ([string]::IsNullOrWhiteSpace($content)) {
        $responseStream = $httpResponse.GetResponseStream()
        if ($responseStream -ne $null) {
          $reader = New-Object System.IO.StreamReader($responseStream)
          $content = $reader.ReadToEnd()
          $reader.Close()
        }
      }

      return [pscustomobject]@{
        StatusCode = [int]$httpResponse.StatusCode
        Content = $content
        ElapsedMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 2)
      }
    }

    throw
  }
}

function Invoke-JsonPost {
  param(
    [string]$Url,
    [hashtable]$Body,
    [hashtable]$Headers
  )

  return Invoke-JsonRequest -Method "Post" -Url $Url -Body $Body -Headers $Headers
}

function Invoke-JsonGet {
  param(
    [string]$Url,
    [hashtable]$Headers
  )

  return Invoke-JsonRequest -Method "Get" -Url $Url -Headers $Headers
}

function Invoke-EndpointProbe {
  param(
    [string]$Method,
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -Method $Method -ErrorAction Stop
    return [pscustomobject]@{
      Reachable = $true
      StatusCode = [int]$response.StatusCode
    }
  }
  catch [System.Net.WebException] {
    if ($_.Exception.Response -ne $null) {
      $httpResponse = [System.Net.HttpWebResponse]$_.Exception.Response
      return [pscustomobject]@{
        Reachable = $true
        StatusCode = [int]$httpResponse.StatusCode
      }
    }

    return [pscustomobject]@{
      Reachable = $false
      StatusCode = 0
    }
  }
}

function Assert-EndpointAvailable {
  param(
    [string]$Method,
    [string]$Path
  )

  $url = "$AuthBaseUrl$Path"
  $probe = Invoke-EndpointProbe -Method $Method -Url $url

  if (-not $probe.Reachable) {
    throw "Preflight failed: cannot reach $url"
  }

  if ($probe.StatusCode -eq 404) {
    throw "Preflight failed: endpoint not found ($Method $Path)"
  }

  if ($probe.StatusCode -ge 500) {
    throw "Preflight failed: server error $($probe.StatusCode) on $Method $Path"
  }

  Write-Host "Preflight OK: $Method $Path -> $($probe.StatusCode)" -ForegroundColor Green
}

function Assert-DatabaseAndSchemas {
  if ([string]::IsNullOrWhiteSpace($AuthDbUrl)) {
    $envPath = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envPath) {
      $authDbLine = Get-Content $envPath | Where-Object { $_ -match '^\s*AUTH_DB_URL\s*=' } | Select-Object -First 1
      if ($authDbLine) {
        $candidate = ($authDbLine -replace '^\s*AUTH_DB_URL\s*=\s*', '').Trim()
        $candidate = $candidate.Trim('"').Trim("'")
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
          $script:AuthDbUrl = $candidate
        }
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($AuthDbUrl)) {
    throw "Preflight failed: AUTH_DB_URL is not set. Provide -AuthDbUrl or set AUTH_DB_URL env var."
  }

  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) {
    throw "Preflight failed: psql command not found in PATH."
  }

  $schemaQuery = "SELECT current_database(), EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'), EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'trading');"
  $raw = & psql $AuthDbUrl -t -A -F "," -c $schemaQuery

  if ($LASTEXITCODE -ne 0) {
    throw "Preflight failed: could not connect to database using AUTH_DB_URL."
  }

  $line = ($raw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1)
  if ([string]::IsNullOrWhiteSpace($line)) {
    throw "Preflight failed: no output returned from schema check query."
  }

  $parts = $line.Split(",")
  if ($parts.Count -lt 3) {
    throw "Preflight failed: unexpected schema check output: $line"
  }

  $dbName = $parts[0]
  $hasAuth = $parts[1].Trim().ToLowerInvariant() -eq "t"
  $hasTrading = $parts[2].Trim().ToLowerInvariant() -eq "t"

  if (-not $hasAuth -or -not $hasTrading) {
    throw "Preflight failed: required schemas missing. auth=$hasAuth trading=$hasTrading"
  }

  Write-Host "Preflight OK: DB reachable ($dbName), schemas auth/trading present" -ForegroundColor Green
}

function Get-JsonValue {
  param([string]$Text)

  try {
    return ($Text | ConvertFrom-Json)
  }
  catch {
    return $null
  }
}

function Get-Average {
  param([double[]]$Values)

  if (-not $Values -or $Values.Count -eq 0) {
    return 0
  }

  return [math]::Round((($Values | Measure-Object -Average).Average), 2)
}

Write-Step "Auth + Trade Integration Demo"
Write-Host "Auth Base URL: $AuthBaseUrl"
Write-Host "Auth DB URL: $AuthDbUrl"
Write-Host "Username: $Username"
Write-Host "Timing Username: $TimingUsername"

Write-Step "Preflight health checks"
Assert-DatabaseAndSchemas
Assert-EndpointAvailable -Method "Post" -Path "/auth/register"
Assert-EndpointAvailable -Method "Post" -Path "/auth/login"
Assert-EndpointAvailable -Method "Post" -Path "/auth/refresh"
Assert-EndpointAvailable -Method "Get" -Path "/auth/me"

Write-Step "Calling /auth/register"
$registerResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/register" -Body @{
  username = $Username
  password = $Password
  email = "$Username@example.com"
  roles = @("CUSTOMER")
}

Write-Host "Register status: $($registerResponse.StatusCode)"
Write-Host "Register latency: $($registerResponse.ElapsedMs) ms"
Write-JsonBody -Label "Register body" -Content $registerResponse.Content -StatusCode $registerResponse.StatusCode

if ($registerResponse.StatusCode -ne 201 -and $registerResponse.StatusCode -ne 409) {
  throw "Register failed unexpectedly with status $($registerResponse.StatusCode)."
}

if ($registerResponse.StatusCode -eq 409) {
  Write-Host "User already exists; continuing to login step for flow demo." -ForegroundColor Yellow
}

Write-Step "Calling /auth/login"
$loginResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
  username = $Username
  password = $Password
}

Write-Host "Login status: $($loginResponse.StatusCode)"
Write-Host "Login latency: $($loginResponse.ElapsedMs) ms"
Write-JsonBody -Label "Login body" -Content $loginResponse.Content -StatusCode $loginResponse.StatusCode

if ($loginResponse.StatusCode -ne 200) {
  throw "Login failed with status $($loginResponse.StatusCode)."
}

$loginJson = Get-JsonValue -Text $loginResponse.Content
if ($null -eq $loginJson -or [string]::IsNullOrWhiteSpace($loginJson.accessToken) -or [string]::IsNullOrWhiteSpace($loginJson.refreshToken)) {
  throw "Login response did not contain accessToken/refreshToken."
}

Write-Step "Calling /auth/refresh"
$refreshResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/refresh" -Body @{
  refreshToken = $loginJson.refreshToken
}

Write-Host "Refresh status: $($refreshResponse.StatusCode)"
Write-Host "Refresh latency: $($refreshResponse.ElapsedMs) ms"
Write-JsonBody -Label "Refresh body" -Content $refreshResponse.Content -StatusCode $refreshResponse.StatusCode

if ($refreshResponse.StatusCode -ne 200) {
  throw "Refresh failed with status $($refreshResponse.StatusCode)."
}

Write-Step "Calling /auth/me"
$meResponse = Invoke-JsonGet -Url "$AuthBaseUrl/auth/me" -Headers @{
  Authorization = "Bearer $($loginJson.accessToken)"
}

Write-Host "Me status: $($meResponse.StatusCode)"
Write-Host "Me latency: $($meResponse.ElapsedMs) ms"
Write-JsonBody -Label "Me body" -Content $meResponse.Content -StatusCode $meResponse.StatusCode

if ($meResponse.StatusCode -ne 200) {
  throw "Get /auth/me failed with status $($meResponse.StatusCode)."
}

Write-Step "Silent setup: fake_john_from_zkuba registration if needed"
$fakeUsername = "fake_john_from_zkuba"
$fakePassword = "testpassword123"
$fakeRegisterResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/register" -Body @{
  username = $fakeUsername
  password = $fakePassword
  email = "$fakeUsername@example.com"
  roles = @("CUSTOMER")
}

if ($fakeRegisterResponse.StatusCode -eq 201) {
  Write-Host "fake_john_from_zkuba created." -ForegroundColor Green
}
elseif ($fakeRegisterResponse.StatusCode -eq 409) {
  Write-Host "fake_john_from_zkuba already exists." -ForegroundColor Yellow
}
else {
  throw "fake_john_from_zkuba registration failed with status $($fakeRegisterResponse.StatusCode)."
}

Write-Step "Throttle demo: fake_john_from_zkuba wrong password attempts"
$wrongPassword = "wrong-password"

for ($i = 1; $i -le 5; $i++) {
  $attemptResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
    username = $fakeUsername
    password = $wrongPassword
  }

  Write-Host "Attempt $i -> status: $($attemptResponse.StatusCode), latency: $($attemptResponse.ElapsedMs) ms"
}

$blockedResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
  username = $fakeUsername
  password = $fakePassword
}

Write-Host "Post-throttle correct password attempt -> status: $($blockedResponse.StatusCode), latency: $($blockedResponse.ElapsedMs) ms"
Write-JsonBody -Label "Post-throttle body" -Content $blockedResponse.Content -StatusCode $blockedResponse.StatusCode

if ($blockedResponse.StatusCode -eq 401) {
  Write-Host "Throttle confirmed: login still blocked even with correct password." -ForegroundColor Green
}
else {
  Write-Host "Throttle not observed as expected. Status was $($blockedResponse.StatusCode)." -ForegroundColor Yellow
}

Write-Step "Timing comparison: wrong-password login responses"
$knownUserWrongTimes = @()
$unknownUserWrongTimes = @()
$knownUserForTiming = $TimingUsername
$unknownUserForTiming = "doesnotexist2"
$timingWrongPassword = "totally-wrong-password"

for ($i = 1; $i -le 3; $i++) {
  $knownAttempt = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
    username = $knownUserForTiming
    password = $timingWrongPassword
  }
  $knownUserWrongTimes += [double]$knownAttempt.ElapsedMs

  $unknownAttempt = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
    username = $unknownUserForTiming
    password = $timingWrongPassword
  }
  $unknownUserWrongTimes += [double]$unknownAttempt.ElapsedMs
}

$knownAvg = Get-Average -Values $knownUserWrongTimes
$unknownAvg = Get-Average -Values $unknownUserWrongTimes
$avgDiff = [math]::Round([math]::Abs($knownAvg - $unknownAvg), 2)

Write-Host "Known user wrong-password times (ms): $($knownUserWrongTimes -join ', ')"
Write-Host "Unknown user wrong-password times (ms): $($unknownUserWrongTimes -join ', ')"
Write-Host "Known user avg (ms): $knownAvg"
Write-Host "Unknown user avg (ms): $unknownAvg"
Write-Host "Absolute avg difference (ms): $avgDiff"
Write-Host "Interpretation: Similar timings reduce username-enumeration signal from password-hash work factor."

Write-Step "Account status behavior demo: suspended vs closed"

$maddyResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
  username = "maddy"
  password = "testpassword123"
}

Write-Host "maddy login status: $($maddyResponse.StatusCode)"
Write-Host "maddy login latency: $($maddyResponse.ElapsedMs) ms"
Write-JsonBody -Label "maddy login body" -Content $maddyResponse.Content -StatusCode $maddyResponse.StatusCode

if ($maddyResponse.StatusCode -eq 403) {
  Write-Host "Expected: maddy is blocked because trading account is SUSPENDED." -ForegroundColor Green
}
else {
  Write-Host "Unexpected for maddy. Expected 403 with ACC-403 blocked message." -ForegroundColor Yellow
}

$superMaddyResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/login" -Body @{
  username = "superMaddy"
  password = "testpassword123"
}

Write-Host "superMaddy login status: $($superMaddyResponse.StatusCode)"
Write-Host "superMaddy login latency: $($superMaddyResponse.ElapsedMs) ms"
Write-JsonBody -Label "superMaddy login body" -Content $superMaddyResponse.Content -StatusCode $superMaddyResponse.StatusCode

if ($superMaddyResponse.StatusCode -eq 200) {
  Write-Host "Expected: superMaddy can still log in even when account is CLOSED." -ForegroundColor Green
}
else {
  Write-Host "Unexpected for superMaddy. Expected normal login success response." -ForegroundColor Yellow
}

Write-Step "Demo completed"
Write-Host "Observe auth-service console logs for internal JWT, trade API calls, and DB query logs." -ForegroundColor Green