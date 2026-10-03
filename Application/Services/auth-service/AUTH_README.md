# Auth Service — Access Guard + Refresh Rotation (README)

Base access/refresh issuance already existed. This note covers only what was
added/fixed for the two acceptance blocks, and how to verify it.

## 1. What lives where

| File | Role |
|---|---|
| `src/services/TokenService.ts` | Signs/verifies access JWTs (HS256, `JWT_SECRET`, issuer `auth-service`, 6 claims: `sub, accountId, roles, iat, exp, iss`). Unchanged. |
| `src/guards/BearerGuard.ts` | Protected-route guard. Rejects missing/malformed/expired/tampered tokens with `AUTH-401`; attaches the **verified** payload to `request.user`. Small hardening: explicit empty-token (`Bearer ` with nothing) rejection. |
| `src/guards/CurrentUser.ts` | **New.** `@CurrentUser()` decorator — extracts the authenticated user from the verified token (i.e. returns `request.user` set by the guard). Never verifies anything itself. Used by `GET /auth/me`. |
| `src/auth/auth.controller.ts` | `GET /auth/me` now takes `@CurrentUser() claims` instead of raw `@Request()`. Refresh flow unchanged in shape (validate → revoke presented → issue new pair). |
| `src/auth/auth.module.ts` | `BearerGuard` registered as provider/export (was missing, guard needs DI). |
| `src/services/RefreshTokenService.ts` | **Fixed.** bcrypt hashing (`cost 10`) with compare-scan matching + revoke-by-id (see §3). Rotation + revocation logic otherwise unchanged. |
| `src/guards/BearerGuard.spec.ts` | **New.** Guard tests, 4 execution paths. |
| `src/auth/auth.controller.refresh.spec.ts` | **New.** Refresh rotation tests, 3 execution paths. |

## 2. Protected route guard (acceptance block 1)

`GET /auth/me` is guarded by `BearerGuard`:

1. `Authorization` header must be exactly `Bearer <jwt>` — anything else → `401 { errorCode: "AUTH-401", message: "Unauthorised" }`.
2. `TokenService.verifyAccessToken` runs `jwt.verify` with `HS256 + JWT_SECRET + issuer`. Signature is checked **first** by the library — no claim is read before verification passes.
3. Expired (`exp` in past), tampered, or wrong-key tokens fail verification → `AUTH-401`.
4. On success the verified payload is attached to `request.user`; `@CurrentUser()` in the controller just returns it.

### Guard test paths (`src/guards/BearerGuard.spec.ts`)

- `# a valid token is accepted` — real token via `createAccessToken`, guard returns `true`, `request.user.sub` set.
- `# an expired token is refused` — genuine token **signed with the real secret but `exp` in the past** (not a corrupted payload, which the signature check would refuse first).
- `# a token with a wrong signature is refused before any claim is read` — genuine, **unexpired** claims signed with a **different key**; asserts `request.user` stays `undefined`.
- `# a malformed header is refused` — missing header, wrong scheme, `Bearer ` with empty token, garbage JWT. All → `AUTH-401`.

## 3. Refresh rotation (acceptance block 2)

Flow in `POST /auth/refresh` (`auth.controller.ts`):

1. `validateRefreshToken(plaintext)` → loads candidate rows and `bcrypt.compare`s the presented token against each stored hash → checks `is_revoked` and `expires_at`.
2. Presented token is **revoked** (`revokeRefreshToken(plaintext)` matches via `bcrypt.compare`, then `UPDATE ... WHERE id = $1`).
3. Fresh account looked up, new access JWT + new opaque refresh token issued; **only the new bcrypt hash** is stored.
4. Replay of the old token → row found with `is_revoked = TRUE` → `401 AUTH-401`.

### The bcrypt design (read this before touching the lookup)

`hashRefreshToken` uses `bcrypt.hash(token, 10)`. Bcrypt is salted/nondeterministic, so hashing the same token twice gives two different strings — a `WHERE token_hash = $1` lookup with a freshly computed hash can **never** match (this was the previous bug: validation always said "not found", revocation updated 0 rows).

The correct bcrypt pattern, as built here:

- **Store:** `storeRefreshToken(userId, await hashRefreshToken(token))` — only the `$2b$…` hash is persisted, never the plaintext. DB read ≠ session takeover (adaptive salted hash).
- **Match:** `findRefreshTokenRow(token)` selects candidate rows and `bcrypt.compare`s each stored hash until one matches. Revoked/expired rows are included in the scan so callers can tell "unknown" apart from "already exchanged (reuse)" and "expired".
- **Revoke:** by primary key (`WHERE id = $1`) on the matched row — never by re-hashed value.

Trade-off (documented): each validate/revoke costs up to N `bcrypt.compare`s (one full scan each, so ~2N per refresh). Fine at this service's scale; if the table grows large, add a fast lookup column (e.g. token-id prefix or SHA-256 of the token alongside the bcrypt hash) to scope candidates before comparing.

### Revocation decision (for the security review)

- **Decision: the presented token IS revoked on every refresh** (`auth.controller.ts` refresh handler, via `revokeRefreshToken`). Second presentation answers `AUTH-401`.
- Residual risk (documented, accepted): replay detection is per-token, not a full session kill — if an attacker steals a refresh token and uses it *first*, the legitimate user's copy stops working (denial of that token, detectable) but other still-valid tokens for the same user are not auto-killed. Upgrade path if needed: on reuse-of-revoked-token, call `revokeAllRefreshTokensForUser(userId)` (method already exists) to kill the whole family.

### Refresh test paths (`src/auth/auth.controller.refresh.spec.ts`, real services + in-memory `refresh_tokens` table)

- `# refresh returns a new access token and a new refresh token` — asserts `200`, both tokens present, `refreshToken != presented`, access JWT verifies with `sub`/`accountId`.
- `# the newly issued refresh token works` — chains refresh #1 → refresh #2 with the new token, both `200`, token changes each time.
- `# only a bcrypt hash of the refresh token is stored, never the token` — stored value matches `$2b$…`, contains no plaintext, and re-hashing differs (salted).
- `# the declared revocation behaviour holds` — replays the already-exchanged token → `401 AUTH-401`.

## 4. How to verify

```bash
cd sprint08/auth-service

# all unit tests (44 passing: TokenService, PasswordService,
# ThrottleService, BearerGuard, refresh rotation)
npx jest

# just the two new suites (7 tests)
npx jest src/guards/BearerGuard.spec.ts src/auth/auth.controller.refresh.spec.ts

# typecheck / build
npx tsc --noEmit
npm run build
```

Live check (needs Postgres + Trade API running, service via `npm run start`):

```bash
# login → copy accessToken + refreshToken
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<user>","password":"<pw>"}'

# valid token → 200 user info
curl http://localhost:3000/auth/me -H "Authorization: Bearer <accessToken>"

# expired / wrong-key / malformed → 401 AUTH-401
curl http://localhost:3000/auth/me -H "Authorization: Bearer invalid.token.here"

# rotate → 200 with NEW pair (refreshToken differs)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'

# replay old refreshToken → 401 AUTH-401 (revocation holds)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<oldRefreshToken>"}'
```

## 5. Email notifications

`POST /auth/register` now requires an `email` (stored AES-256-GCM encrypted,
see `EmailEncryptionService`). `src/services/NotificationService.ts` sends:

| Trigger | Email |
|---|---|
| `POST /auth/register` succeeds | Welcome / registered, next step is KYC |
| `POST /kyc` succeeds | KYC submitted, awaiting approval |
| `PATCH /kyc` with `APPROVED` | KYC approved, trading account active |
| `PATCH /kyc` with `REJECTED` | KYC not approved, with the rejection reason |

Sending is fire-and-forget: an SMTP failure is logged and never fails the
request. Logs carry the user id only, never the address. Users registered
before email capture (`@placeholder.local`) are skipped.

| Env var | Default | Meaning |
|---|---|---|
| `SMTP_HOST` | unset | SMTP server. **Unset disables sending** (each email is logged as skipped). |
| `SMTP_PORT` | `1025` | SMTP port. |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465). |
| `SMTP_USER` / `SMTP_PASS` | unset | SMTP auth, only sent when `SMTP_USER` is set. |
| `MAIL_FROM` | `Enterprise Trading Platform <no-reply@trading.local>` | Sender address. |

Local testing with Mailpit (from `sprint09/`):

```bash
docker compose --profile platform up -d mailpit
SMTP_HOST=localhost SMTP_PORT=1025 npm run dev   # PowerShell: $env:SMTP_HOST="localhost"; $env:SMTP_PORT="1025"; npm run dev
# open http://localhost:8025 to read captured mail
```

## 6. Last verification run

- `npx jest` → **5 suites, 45 tests, all pass** (includes the 4 guard paths + 4 refresh paths above).
- `npx tsc --noEmit` → clean, no errors.
