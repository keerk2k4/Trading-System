# Quick Verification (5 minutes)

## Terminal 1: Build & Test
```bash
cd sprint08/auth-service
npm run build
npm test
```

## Terminal 2: Start Service
```bash
cd sprint08/auth-service
npm run start
```

## Terminal 3: Quick Tests

### 1. Register a test user
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"verifytest","password":"Test@123"}'
```

### 2. Login (get token)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"verifytest","password":"Test@123"}'
```

Save the `accessToken` from response.

### 3. Verify JWT Claims (check the token payload)
Paste token at https://jwt.io OR:

PowerShell:
```powershell
$token = "paste_access_token_here"
$parts = $token -split '\.'
$json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1] + '=='))
$json | ConvertFrom-Json | Format-Table
```

Look for exactly these 6 fields:
- sub (UUID)
- accountId (number)
- roles (array)
- iat (seconds)
- exp (iat + 900)
- iss ("auth-service")

### 4. Test Failed Login (should be identical to unknown user)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"verifytest","password":"wrong"}'
```

### 5. Test Unknown User (should be identical to wrong password)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nonexistent","password":"test"}'
```

Both Step 4 & 5 should return:
- Status: 401
- errorCode: "AUTH-401"  
- message: "Unauthorised"

### 6. Test Throttle (run 5 times)
```bash
for i in 1 2 3 4 5; do
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"verifytest","password":"wrong"}'
  echo ""
done
```

All 5 should return 401.

### 7. 6th attempt (should still be 401, throttled)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"verifytest","password":"wrong"}'
```

Should return 401 "Unauthorised" (throttled).

---

## What to Look For

✅ **Pass if you see:**
1. Build succeeds (no errors)
2. Token has exactly 6 claims (no email, username, password)
3. Unknown user and wrong password return identical 401 responses
4. After 5 failed attempts, further attempts are throttled
5. Valid token can access protected endpoints
6. Invalid token rejected with 401

❌ **Fail if:**
- Build has errors
- Token has extra claims
- Different responses for unknown user vs wrong password
- No throttle after 5 attempts
- Invalid token is accepted

---

## Full Test File Created
See `VERIFICATION_STEPS.md` for 15 detailed steps with expected outputs.
