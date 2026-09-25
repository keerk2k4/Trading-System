param(
  [string]$AuthBaseUrl = "http://localhost:3000",
  [string]$Username = "real_john_1",
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

function Invoke-JsonPost {
  param(
    [string]$Url,
    [hashtable]$Body
  )

  $jsonBody = $Body | ConvertTo-Json -Depth 5

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Post -ContentType "application/json" -Body $jsonBody -ErrorAction Stop
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Content = $response.Content
    }
  }
  catch [System.Net.WebException] {
    if ($_.Exception.Response -ne $null) {
      $httpResponse = [System.Net.HttpWebResponse]$_.Exception.Response
      $reader = New-Object System.IO.StreamReader($httpResponse.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()

      return [pscustomobject]@{
        StatusCode = [int]$httpResponse.StatusCode
        Content = $content
      }
    }

    throw
  }
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
Write-Host "Login body:"
Write-Host (Format-JsonOutput -Text $loginResponse.Content)

if ($loginResponse.StatusCode -ne 200) {
  throw "Login failed with status $($loginResponse.StatusCode)."
}

Write-Step "Demo completed"
Write-Host "Observe auth-service console logs for internal JWT, trade API calls, and DB query logs." -ForegroundColor Green