param(
  [string]$AuthBaseUrl = "http://localhost:3000",
  [string]$Username = "john",
  [string]$Password = "johnbelongstoswag"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==== $Message ====" -ForegroundColor Cyan
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
Write-Host "Username: $Username"

Write-Step "Calling /auth/register"
$registerResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/register" -Body @{
  username = $Username
  password = $Password
  roles = @("CUSTOMER")
}

Write-Host "Register status: $($registerResponse.StatusCode)"
Write-Host "Register latency: $($registerResponse.ElapsedMs) ms"
Write-Host "Register body:"
Write-Host (Format-JsonOutput -Text $registerResponse.Content)

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
Write-Host "Login body:"
Write-Host (Format-JsonOutput -Text $loginResponse.Content)

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
Write-Host "Refresh body:"
Write-Host (Format-JsonOutput -Text $refreshResponse.Content)

if ($refreshResponse.StatusCode -ne 200) {
  throw "Refresh failed with status $($refreshResponse.StatusCode)."
}

Write-Step "Calling /auth/me"
$meResponse = Invoke-JsonGet -Url "$AuthBaseUrl/auth/me" -Headers @{
  Authorization = "Bearer $($loginJson.accessToken)"
}

Write-Host "Me status: $($meResponse.StatusCode)"
Write-Host "Me latency: $($meResponse.ElapsedMs) ms"
Write-Host "Me body:"
Write-Host (Format-JsonOutput -Text $meResponse.Content)

if ($meResponse.StatusCode -ne 200) {
  throw "Get /auth/me failed with status $($meResponse.StatusCode)."
}

Write-Step "Silent setup: fake_john registration if needed"
$fakeUsername = "fake_john"
$fakePassword = "averysecurepassword"
$fakeRegisterResponse = Invoke-JsonPost -Url "$AuthBaseUrl/auth/register" -Body @{
  username = $fakeUsername
  password = $fakePassword
  roles = @("CUSTOMER")
}

if ($fakeRegisterResponse.StatusCode -eq 201) {
  Write-Host "fake_john created." -ForegroundColor Green
}
elseif ($fakeRegisterResponse.StatusCode -eq 409) {
  Write-Host "fake_john already exists." -ForegroundColor Yellow
}
else {
  throw "fake_john registration failed with status $($fakeRegisterResponse.StatusCode)."
}

Write-Step "Throttle demo: fake_john wrong password attempts"
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
Write-Host "Post-throttle body:"
Write-Host (Format-JsonOutput -Text $blockedResponse.Content)

if ($blockedResponse.StatusCode -eq 401) {
  Write-Host "Throttle confirmed: login still blocked even with correct password." -ForegroundColor Green
}
else {
  Write-Host "Throttle not observed as expected. Status was $($blockedResponse.StatusCode)." -ForegroundColor Yellow
}

Write-Step "Timing comparison: wrong-password login responses"
$knownUserWrongTimes = @()
$unknownUserWrongTimes = @()
$knownUserForTiming = $Username
$unknownUserForTiming = "no_such_user_for_timing_demo"
$timingWrongPassword = "totally-wrong-password"

for ($i = 1; $i -le 4; $i++) {
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
Write-Host "maddy login body:"
Write-Host (Format-JsonOutput -Text $maddyResponse.Content)

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
Write-Host "superMaddy login body:"
Write-Host (Format-JsonOutput -Text $superMaddyResponse.Content)

if ($superMaddyResponse.StatusCode -eq 200) {
  Write-Host "Expected: superMaddy can still log in even when account is CLOSED." -ForegroundColor Green
}
else {
  Write-Host "Unexpected for superMaddy. Expected normal login success response." -ForegroundColor Yellow
}

Write-Step "Demo completed"
Write-Host "Observe auth-service console logs for internal JWT, trade API calls, and DB query logs." -ForegroundColor Green