# Step-by-Step Verification Commands

## Step 1: Build the Auth Service
```bash
cd sprint08/auth-service
npm run build
```
Expected: No errors, successful compilation.

---

## Step 2: Run Unit Tests
```bash
npm test -- --passWithNoTests
```
Expected: All tests pass (TokenService, ThrottleService, PasswordService tests).

---

## Step 3: Start Auth Service (in a new terminal)
```bash
cd sprint08/auth-service
npm run start
```
Expected: Output shows "Auth Service running on port 3000"

---

## Step 4: Test Health Endpoint
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"UP"}`

---

## Step 5: Test Registration (create new user)
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"Password@123"}'
```
Expected: Status 201, response with user ID and username.

---

## Step 6: Test Login (get access token)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"Password@123"}'
```
Expected: Status 200, response with accessToken, refreshToken, tokenType, expiresIn.

---

## Step 7: Decode JWT Token (verify claims)
Copy the accessToken from Step 6, then go to https://jwt.io and paste it.
OR use this command to decode locally (PowerShell):

```bash
$token = "YOUR_ACCESS_TOKEN_HERE"
$parts = $token -split '\.'
[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1] + '==')) | ConvertFrom-Json
```

Expected payload should contain EXACTLY these 6 claims:
- sub: (user UUID)
- accountId: (numeric)
- roles: ["CUSTOMER"]
- iat: (epoch seconds)
- exp: (iat + 900)
- iss: "auth-service"

NO email, username, password, or extra claims.

---

## Step 8: Test Unknown User (uniform failure)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nonexistent_user_xyz","password":"anypassword"}'
```
Expected: Status 401, message "Unauthorised", errorCode "AUTH-401"

---

## Step 9: Test Wrong Password (same failure as Step 8)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"WrongPassword@123"}'
```
Expected: Status 401, same message "Unauthorised", errorCode "AUTH-401"

Compare with Step 8 response - should be IDENTICAL.

---

## Step 10: Test Bearer Token Protection
Use the token from Step 6:

```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```
Expected: Status 200, returns current user info.

---

## Step 11: Test Invalid Token (wrong signature)
```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer invalid.token.here"
```
Expected: Status 401, errorCode "AUTH-401", message "Unauthorised"

---

## Step 12: Test Login Throttle (5 failed attempts)
Run these 5 times (will fail, that's expected):

```bash
# Failed attempt 1-5
for i in {1..5}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser123","password":"wrong"}'
  sleep 1
done
```

Expected: All return 401 "Unauthorised"

---

## Step 13: Test Throttle is Active (6th attempt)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"wrong"}'
```
Expected: Status 401 "Unauthorised" (throttled, no processing)

---

## Step 14: Verify Password Hashing
```bash
# Check password is stored as bcryptjs hash (not MD5/SHA256)
psql -U postgres -d trading_system -c "SELECT password_hash FROM auth.users WHERE user_name = 'testuser123';" 
```
Expected: Hash starts with `$2b$12$` (bcryptjs format, NOT `5d41402abc4...` (MD5))

---

## Step 15: Test Timing Comparison (optional, advanced)
Run these in parallel to compare timing:

Unknown user (dummy hash verification):
```bash
time curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nonexistent_xyz","password":"test"}' > /dev/null
```

Wrong password (real hash verification):
```bash
time curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"wrong"}' > /dev/null
```

Expected: Both should have COMPARABLE timing (within ~50ms of each other).

---

## Summary Checklist

After running all steps, verify:

- [ ] Build succeeds (Step 1)
- [ ] Tests pass (Step 2)
- [ ] Service starts (Step 3)
- [ ] Health endpoint works (Step 4)
- [ ] Registration works (Step 5)
- [ ] Login returns token (Step 6)
- [ ] JWT has exactly 6 claims (Step 7)
- [ ] Unknown user returns 401 (Step 8)
- [ ] Wrong password returns same 401 (Step 9)
- [ ] Valid token can access /auth/me (Step 10)
- [ ] Invalid token rejected (Step 11)
- [ ] Throttle blocks after 5 attempts (Step 12-13)
- [ ] Password stored as bcryptjs hash (Step 14)
- [ ] Timing comparable (Step 15)

If all pass ✅ = Implementation is correct!
