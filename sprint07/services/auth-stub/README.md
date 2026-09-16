# Auth Stub Service

## Overview

The Auth Stub provides JWT token generation and validation for development and testing. It runs alongside the Spring Boot application and provides a shared signing secret used to validate JWT tokens.

## Configuration

### Signing Secret

All JWT tokens must be signed with the following secret (HMAC-SHA256):

```
your-256-bit-secret-key-for-hmac-sha256-token-signing
```

This secret must be configured in the Spring Boot application via the `JWT_SECRET` environment variable.

### Algorithm

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Token Type**: JWT (JSON Web Token)

## Demo Users

The following demo users can be used for testing. Each user has multiple accounts.

### User 1: Alice Johnson
- **User ID**: 1
- **First Name**: Alice
- **Last Name**: Johnson
- **Email**: alice@example.com
- **Status**: ACTIVE

#### Accounts:
| Account ID | Account Number | Balance | Status |
|---|---|---|---|
| 1001 | ACC-001 | 50000.00 | ACTIVE |
| 1002 | ACC-002 | 25000.00 | ACTIVE |
| 1003 | ACC-003 | 0.00 | SUSPENDED |

### User 2: Bob Smith
- **User ID**: 2
- **First Name**: Bob
- **Last Name**: Smith
- **Email**: bob@example.com
- **Status**: ACTIVE

#### Accounts:
| Account ID | Account Number | Balance | Status |
|---|---|---|---|
| 2001 | ACC-010 | 100000.00 | ACTIVE |
| 2002 | ACC-011 | 0.00 | CLOSED |

### User 3: Charlie Brown
- **User ID**: 3
- **First Name**: Charlie
- **Last Name**: Brown
- **Email**: charlie@example.com
- **Status**: BLOCKED

#### Accounts:
| Account ID | Account Number | Balance | Status |
|---|---|---|---|
| 3001 | ACC-020 | 75000.00 | ACTIVE |

## JWT Token Structure

All JWT tokens follow this structure:

### Header
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Payload
```json
{
  "sub": "username",
  "accountId": 1001,
  "iat": 1693478400,
  "exp": 1693564800,
  "iss": "auth-stub"
}
```

**Claims:**
- `sub`: Subject (username) - string
- `accountId`: The numeric account ID the token is authorized for - number
- `iat`: Issued At - Unix timestamp
- `exp`: Expiration Time - Unix timestamp (typically 24 hours from iat)
- `iss`: Issuer - always "auth-stub"

## Token Generation

To generate a valid test token:

1. Create the header:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

2. Create the payload with the desired `accountId`:
```json
{
  "sub": "alice@example.com",
  "accountId": 1001,
  "iat": <current-unix-timestamp>,
  "exp": <current-unix-timestamp-plus-86400>,
  "iss": "auth-stub"
}
```

3. Sign with the secret using HMAC-SHA256

4. The final token format is: `BASE64URL(header).BASE64URL(payload).BASE64URL(signature)`

## Token Validation Order

The Spring Boot application validates tokens in the following order:

1. **Signature**: Verify the signature matches the secret
2. **Expiration**: Verify the token has not expired (exp claim)
3. **Algorithm**: Verify the algorithm is HS256

If any of these checks fail, the request returns `AUTH-401` with status 401.

## Account Authorization

After token validation, the application verifies that the requested account matches the token's `accountId` claim:

- If the token's `accountId` doesn't match the requested account in the URL, the request returns `ACC-403` with status 403
- This prevents a token for one account from accessing another account's data

## Example Usage

### Valid Request

```bash
curl -X GET "http://localhost:8080/api/v1/accounts/1001/balance" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZUBleGFtcGxlLmNvbSIsImFjY291bnRJZCI6MTAwMSwiZXhwIjoxNjk0MDY0ODAwLCJpYXQiOjE2OTM0NzMyMDAsImlzcyI6ImF1dGgtc3R1YiJ9.signature"
```

### Missing Token

```bash
curl -X GET "http://localhost:8080/api/v1/accounts/1001/balance"
# Response: 401 AUTH-401 Unauthorised
```

### Wrong Scheme

```bash
curl -X GET "http://localhost:8080/api/v1/accounts/1001/balance" \
  -H "Authorization: Basic dXNlcjpwYXNz"
# Response: 401 AUTH-401 Unauthorised
```

### Expired Token

```bash
curl -X GET "http://localhost:8080/api/v1/accounts/1001/balance" \
  -H "Authorization: Bearer <expired-token>"
# Response: 401 AUTH-401 Unauthorised
```

### Invalid Signature

```bash
curl -X GET "http://localhost:8080/api/v1/accounts/1001/balance" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZUBleGFtcGxlLmNvbSIsImFjY291bnRJZCI6MTAwMSwiZXhwIjoxNjk0MDY0ODAwLCJpYXQiOjE2OTM0NzMyMDAsImlzcyI6ImF1dGgtc3R1YiJ9.invalidsignature"
# Response: 401 AUTH-401 Unauthorised
```

### Token for Wrong Account

```bash
# Token has accountId=1001, but requesting account 1002
curl -X GET "http://localhost:8080/api/v1/accounts/1002/balance" \
  -H "Authorization: Bearer <token-for-account-1001>"
# Response: 403 ACC-403 Account not active
```

## Sprint 8 Migration

In Sprint 8, this stub is replaced with a real authentication service. All code must depend on:

- The JWT token structure (claims and their meanings)
- The validation order (signature → expiry → algorithm)
- The error codes (`AUTH-401` for token failures, `ACC-403` for account mismatches)

Code must NOT depend on:
- The signing secret (configuration change in Sprint 8)
- The demo user data (replaced with real LDAP/OAuth provider)
- How tokens are generated (real service provides them)

## Running the Stub

The stub is started automatically with the Spring Boot infrastructure:

```bash
cd sprint06/spring-boot-app
./mvnw spring-boot:run
```

The JWT validation is configured via:
- `JWT_SECRET` environment variable: Contains the signing secret
- `application.properties`: Configures Spring Security filters
