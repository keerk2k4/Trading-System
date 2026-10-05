# Auth Service: the complete guide

This guide explains the authentication service from start to finish: every folder and file, what each one does,
and how they work together. It uses **real flows** (register, sign in, refresh a token, submit and review KYC…) to
show where each file comes into play.

- **Code location:** [Application/Services/auth-service/](../Services/auth-service/)
- **Companion guides:** [frontend-app-guide.md](frontend-app-guide.md) (the Angular side, which calls this service),
  [order-service-guide.md](order-service-guide.md) (Trade REST API, called by this service on login and KYC approval),
  [executor-service-guide.md](executor-service-guide.md) (order execution and live prices)

Paths shown in code blocks and tables are relative to `Application/Services/auth-service/` unless they say
otherwise.

---

## Table of contents

- [Part 0: The 60-second mental model](#part-0-the-60-second-mental-model)
- [Part 1: NestJS crash course (only what this service uses)](#part-1-nestjs-crash-course-only-what-this-service-uses)
- [Part 2: Folder and file map](#part-2-folder-and-file-map)
- [Part 3: Tooling, configuration and environment variables](#part-3-tooling-configuration-and-environment-variables)
- [Part 4: How the service boots](#part-4-how-the-service-boots)
- [Part 5: Every endpoint at a glance](#part-5-every-endpoint-at-a-glance)
- [Part 6: The code, file by file](#part-6-the-code-file-by-file)
- [Part 7: The database tables](#part-7-the-database-tables)
- [Part 8: Flows end to end](#part-8-flows-end-to-end)
- [Part 9: Security design](#part-9-security-design)
- [Part 10: Error codes](#part-10-error-codes)
- [Part 11: Testing](#part-11-testing)
- [Part 12: Commands cheat sheet](#part-12-commands-cheat-sheet)
- [Part 13: Known issues, risks and technical debt](#part-13-known-issues-risks-and-technical-debt)
- [Part 14: Review questions and answers](#part-14-review-questions-and-answers)
- [Part 15: Glossary](#part-15-glossary)

---

## Part 0: The 60-second mental model

The auth service is a **NestJS** (Node.js + TypeScript) HTTP API on port **3000**. It owns **who you are**
(users, passwords, roles), **proof of who you are** (JWT access tokens and refresh tokens) and **identity
verification** (KYC). It does **not** own money, orders or trading accounts; those belong to the Trade REST API
(the Java `order-service`).

```
 Angular UI (localhost:4200)
   │  POST /auth/register, /auth/login, /auth/refresh, /auth/logout   (public;
   │       login/refresh set and logout clears the HttpOnly refresh_token cookie)
   │  GET /auth/me, GET|POST|PUT /kyc, GET /kyc/pending, PATCH /kyc  (Bearer JWT)
   ▼
┌──────────────────────────── auth-service (NestJS, :3000) ────────────────────────────┐
│  main.ts: CORS (UI_ORIGIN, credentials) · global ValidationPipe · Swagger at /docs     │
│                                                                                       │
│  AuthController (/auth/*)              KycController (/kyc*)                           │
│        │  BearerGuard verifies JWT → @CurrentUser() gives the claims                   │
│        ▼                                                                              │
│  TokenService (JWT HS256) · PasswordService (bcrypt) · RefreshTokenService            │
│  ThrottleService (in-memory lockout) · NotificationService (SMTP email)                │
│  AccountProvisioningEventService (Kafka) · TradeApiClient (HTTP to Trade API)          │
│        │                                                                              │
│  UserRepository · KycRepository · RefreshTokenRepository  ──►  DatabaseService (pg)    │
└───────┬───────────────────────┬──────────────────────────┬───────────────────┬───────┘
        │ SQL                   │ Kafka "user-registrations"│ HTTP /internal/... │ SMTP
        ▼                       ▼                          ▼                   ▼
  PostgreSQL schema `auth`   order-service consumer   Trade REST API (:8080)  Mailpit /
  users, user_roles, kyc,    creates a PENDING        look up / activate      mail server
  refresh_tokens             trading account          trading accounts
```

Six ideas explain almost everything:

1. **Controllers** receive HTTP requests and send responses. There are two: `AuthController` (`/auth/*`) and
   `KycController` (`/kyc*`).
2. **Services and repositories** do the work. Services hold logic (hashing, tokens, email); repositories run SQL.
   NestJS creates them and **injects** them into constructors.
3. **The JWT access token** (15 minutes) is the user's ID card for every API in the platform. It is signed with
   `JWT_SECRET` and carries `sub` (user id), `accountId` and `roles`.
4. **The refresh token** (7 days) is a random string stored **hashed** in the database. It's **single-use**:
   every refresh revokes it and issues a new one (rotation). Browsers receive it as an **HttpOnly
   `refresh_token` cookie** scoped to `/auth`, so page JavaScript can never read it. It's also still returned
   in the JSON body for non-browser clients.
5. **Registration doesn't create the trading account directly.** It publishes a `USER_REGISTERED` Kafka event,
   and the order-service creates a `PENDING` account asynchronously. **KYC approval** activates that account.
6. **Server-to-server calls** to the Trade API use a separate, 60-second **internal service token**, never a
   customer's JWT.

---

## Part 1: NestJS crash course (only what this service uses)

NestJS is a framework on top of **Express** (the classic Node HTTP server). It adds structure: modules,
dependency injection and decorators. If you know Angular, it will feel familiar; Nest borrowed many of its ideas.

### 1.1 Decorators

A decorator is an `@Something(...)` annotation that attaches metadata to a class, method or parameter. Nest
reads the metadata to wire things up. This needs `experimentalDecorators` and `emitDecoratorMetadata` in
[tsconfig.json](../Services/auth-service/tsconfig.json), plus the `reflect-metadata` package.

| Decorator | Meaning |
|---|---|
| `@Module({...})` | groups controllers and providers |
| `@Controller('auth')` | a class whose methods handle routes under `/auth` |
| `@Get()`, `@Post('login')`, `@Put()`, `@Patch()` | the HTTP method + sub-path a method handles |
| `@Body()` | inject the parsed JSON body |
| `@Res()` | inject the raw Express `Response` (this service builds every response manually) |
| `@Request()` / `@Req()` | inject the raw Express request (`refresh`/`logout` use `@Req()` to read the `Cookie` header) |
| `@HttpCode(200)` | default status code |
| `@UseGuards(BearerGuard)` | run a guard before the handler |
| `@Injectable()` | a class Nest can create and inject |
| `@CurrentUser()` | a **custom** parameter decorator defined in this project |
| `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiProperty`, `@ApiBearerAuth` | Swagger/OpenAPI documentation only |
| `@IsString()`, `@MinLength()`, `@Matches()`, `@IsEmail()`, `@IsEnum()`… | `class-validator` rules on DTO fields |

### 1.2 Modules

```ts
@Module({
  imports: [DatabaseModule],              // other modules whose exported providers I need
  controllers: [AuthController, KycController],
  providers: [TokenService, PasswordService, ...],   // classes Nest should create and inject
  exports: [TokenService, ...]            // what modules importing me may use
})
export class AuthModule {}
```

There are three modules here: `AppModule` (root), `DatabaseModule` (the Postgres pool) and `AuthModule`
(everything else).

### 1.3 Dependency injection (constructor style)

Unlike the Angular frontend (which uses `inject()`), Nest code asks for dependencies in the **constructor**:

```ts
constructor(private tokenService: TokenService, private userRepository: UserRepository) {}
```

Nest reads the parameter **types** (thanks to `emitDecoratorMetadata`), finds or creates the matching
providers, and passes them in. By default every provider is a **singleton** for the whole app. That matters for
`ThrottleService`, whose in-memory `Map` is shared by all requests.

### 1.4 Request lifecycle in this service

```
HTTP request
  → CORS check (main.ts)
  → Guard (BearerGuard, only on protected routes): throws 401 or sets request.user
  → ValidationPipe (global): turns JSON into a DTO class instance and validates it; 400 if invalid
  → Controller method (@Body, @CurrentUser, @Res parameters filled in)
  → services/repositories → Postgres / Kafka / Trade API / SMTP
  → res.status(...).json(...)
```

### 1.5 DTOs and the ValidationPipe

A **DTO** (Data Transfer Object) is a class describing a request or response body. In
[main.ts](../Services/auth-service/src/main.ts):

```ts
new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
```

- `transform: true` converts the incoming JSON into an instance of the DTO class.
- `whitelist: true` strips properties that have no validation decorator.
- `forbidNonWhitelisted: true` **rejects** the request instead of stripping them.
- If validation fails, Nest throws `BadRequestException` → **HTTP 400** with Nest's default body
  `{ statusCode, message: [...], error }`. See [Part 13](#part-13-known-issues-risks-and-technical-debt) for why
  that matters.

### 1.6 Guards

A guard is a class with `canActivate(context): boolean`. Returning `true` lets the request through; throwing
`UnauthorizedException` stops it with 401. `BearerGuard` also **attaches** the verified token payload to
`request.user`, and the custom `@CurrentUser()` decorator reads it back out.

### 1.7 Lifecycle hooks

- `OnModuleInit.onModuleInit()`: `DatabaseService` creates the Postgres pool here.
- `OnModuleDestroy.onModuleDestroy()`: closes the pool / disconnects the Kafka producer at shutdown.

### 1.8 Why `@Res()` everywhere?

When a handler injects `@Res()`, Nest stops auto-serialising the return value. The handler must call
`res.status(...).json(...)` itself. This codebase does that everywhere so it controls the exact status code and
`{ errorCode, message }` body for each branch. The trade-off is that `@HttpCode(...)` becomes mostly
documentation.

### 1.9 Libraries used

| Library | Used for |
|---|---|
| `jsonwebtoken` | sign/verify JWTs (`TokenService`) |
| `bcryptjs` | hash passwords (cost 12) and refresh tokens (cost 10) |
| `crypto` (Node built-in) | random refresh tokens, HMAC lookup hash, AES-GCM, UUIDs |
| `pg` | PostgreSQL connection pool and parameterised queries |
| `kafkajs` | publish `USER_REGISTERED` events |
| `nodemailer` | send notification emails over SMTP |
| `class-validator` / `class-transformer` | DTO validation |
| `@nestjs/swagger` | OpenAPI docs at `/docs` |
| `@nestjs/config` | load `.env` into `process.env` |
| `fetch` (Node 18+ built-in) | HTTP calls to the Trade API |

`@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt` and `uuid` are listed in `package.json` but **not
used**. Tokens are handled directly with `jsonwebtoken`.

---

## Part 2: Folder and file map

```
auth-service/
├── package.json                 scripts (dev, build, start, test) + dependencies
├── package-lock.json            exact dependency versions
├── tsconfig.json                TypeScript config (CommonJS, ES2021, strict, decorators, "@/..." path alias)
├── jest.config.cjs              Jest unit-test config (ts-jest, rootDir src, *.spec.ts)
├── Dockerfile                   two-stage Node 20 image: build → runtime (npm start on port 3000)
├── .env.example                 sample environment variables (copy to .env)
├── .gitignore                   node_modules, .env, dist
├── AUTH_README.md               older notes on the bearer guard + refresh rotation (partly outdated; see Part 13)
├── token-flow.mmd               Mermaid diagram of the login → refresh token flow
├── run-auth-trade-integration-demo.ps1   PowerShell demo: register, login, refresh, /me, throttle, timing, suspended account
├── dist/                        compiled JavaScript (gitignored)
└── src/
    ├── main.ts                  entry point: create app, CORS, ValidationPipe, Swagger, listen
    ├── app.module.ts            root module: ConfigModule (.env) + DatabaseModule + AuthModule
    ├── auth/
    │   ├── auth.module.ts       registers both controllers and every service/repository/guard
    │   ├── auth.controller.ts   /auth/register, /auth/admin/register, /auth/login, /auth/admin/login,
    │   │                        /auth/refresh, /auth/logout, /auth/me
    │   ├── kyc.controller.ts    GET/POST/PUT /kyc, GET /kyc/pending, PATCH /kyc
    │   ├── auth.controller.spec.ts          controller unit tests (mocked dependencies)
    │   ├── auth.controller.refresh.spec.ts  refresh rotation tests (real services, in-memory table)
    │   └── kyc.controller.spec.ts
    ├── guards/
    │   ├── BearerGuard.ts       verifies the access JWT, sets request.user
    │   ├── BearerGuard.spec.ts
    │   └── CurrentUser.ts       @CurrentUser() param decorator + AuthenticatedUser type
    ├── services/
    │   ├── TokenService.ts                     create/verify JWTs (user + internal service tokens)
    │   ├── PasswordService.ts                  bcrypt hash/verify + dummy hash
    │   ├── RefreshTokenService.ts              generate, hash, store, validate, revoke refresh tokens
    │   ├── ThrottleService.ts                  5 failed logins → 15-minute lock (in memory)
    │   ├── TradeApiClient.ts                   calls the Trade API's /internal/accounts endpoints
    │   ├── AccountProvisioningEventService.ts  Kafka producer for USER_REGISTERED
    │   ├── NotificationService.ts              registration/KYC emails via SMTP (best effort)
    │   ├── EmailEncryptionService.ts           AES-256-GCM for emails (NOT wired in; see Part 13)
    │   └── *.spec.ts
    ├── repositories/
    │   ├── UserRepository.ts          auth.users + auth.user_roles SQL
    │   ├── KycRepository.ts           auth.kyc SQL
    │   ├── RefreshTokenRepository.ts  auth.refresh_tokens SQL (HMAC lookup + bcrypt check)
    │   └── UserRepository.spec.ts
    ├── database/
    │   ├── database.module.ts         provides DatabaseService
    │   ├── database.service.ts        pg Pool; resolves AUTH_DB_URL / DB_URL
    │   └── database.service.spec.ts
    ├── entities/
    │   ├── User.ts                    TS shape of a user row
    │   └── Kyc.ts                     TS shape of a KYC row
    └── dtos/                          request/response classes (validation + Swagger)
        ├── RegisterRequest.ts  LoginRequest.ts  RefreshRequest.ts
        ├── CreateKycRequest.ts UpdateKycRequest.ts
        ├── TokenResponse.ts    UserResponse.ts  KycResponse.ts  ErrorResponse.ts
```

**Layering rule:** controller → service/repository → `DatabaseService`. Controllers never write SQL;
repositories never decide HTTP status codes.

---

## Part 3: Tooling, configuration and environment variables

### [package.json](../Services/auth-service/package.json)

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `nest start --watch` | compile + run, restart on file change |
| `npm run build` | `nest build` | compile `src/` → `dist/` |
| `npm start` | `node dist/main` | run the compiled build (what Docker runs) |
| `npm test` | `jest` | unit tests |
| `npm run test:coverage` | `jest --coverage --runInBand` | tests + coverage report in `coverage/` |

### [tsconfig.json](../Services/auth-service/tsconfig.json)

CommonJS modules, target ES2021, `strict: true`, decorators enabled, `@/*` path alias for `src/*`, and specs
excluded from the build.

### [jest.config.cjs](../Services/auth-service/jest.config.cjs)

Runs `src/**/*.spec.ts` through `ts-jest` in a Node environment; maps `@/` to `src/`.

### [Dockerfile](../Services/auth-service/Dockerfile)

A **multi-stage build**: stage 1 installs all dependencies and runs `npm run build`; stage 2 installs only
production dependencies (`npm ci --omit=dev`), copies `dist/` and runs `npm start` on port 3000. The final image
contains no TypeScript sources and no dev tools.

### Environment variables

`AppModule` loads `.env` via `ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true })`. Services read
`process.env` directly.

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `PORT` | `3000` | main.ts | HTTP port |
| `UI_ORIGIN` | `http://localhost:4200` | main.ts | the only origin CORS allows |
| `AUTH_DB_URL` (or `DB_URL`) | **required** | DatabaseService | `postgresql://user:password@host:5432/db`; must include user + password |
| `JWT_SECRET` | **required** (no default) | TokenService | HMAC-SHA256 signing key, shared with the Trade API so it can verify tokens |
| `JWT_ISSUER` | `auth-service` | TokenService | `iss` claim, checked on verify |
| `JWT_ACCESS_TOKEN_EXPIRY_SECONDS` | `900` (15 min) | TokenService | access token lifetime |
| `JWT_REFRESH_TOKEN_EXPIRY_SECONDS` | `604800` (7 days) | TokenService → RefreshTokenService | refresh token lifetime |
| `JWT_INTERNAL_ACCESS_TOKEN_EXPIRY_SECONDS` | `60` | TokenService | internal service token lifetime |
| `TRADE_API_URL` | `http://localhost:8080` | TradeApiClient | Trade REST API base URL |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | AccountProvisioningEventService | comma-separated brokers |
| `USER_REGISTERED_TOPIC` | `user-registrations` | AccountProvisioningEventService | Kafka topic |
| `TOKEN_LOOKUP_SECRET` | `default-lookup-secret-change-in-prod` | RefreshTokenService / Repository | HMAC key for the refresh-token lookup hash |
| `EMAIL_ENCRYPTION_KEY` | dev fallback | EmailEncryptionService | AES key (service currently unused) |
| `SMTP_HOST` | unset = email disabled | NotificationService | SMTP server |
| `SMTP_PORT` | `1025` | NotificationService | |
| `SMTP_SECURE` | `false` | NotificationService | `true` for implicit TLS |
| `SMTP_USER` / `SMTP_PASS` | unset | NotificationService | SMTP auth |
| `MAIL_FROM` | `Enterprise Trading Platform <no-reply@trading.local>` | NotificationService | sender |

[.env.example](../Services/auth-service/.env.example) only lists the first group. Anything in the
table not in that file falls back to its default.

### Other files

- [AUTH_README.md](../Services/auth-service/AUTH_README.md): an earlier write-up of the bearer guard,
  refresh rotation and email notifications. Useful background, but some parts are outdated (see Part 13).
- [token-flow.mmd](../Services/auth-service/token-flow.mmd): a Mermaid flowchart of
  login → access (15 min) + refresh (7 days) → refresh → revoke old → new pair. VS Code and GitHub can render it.
- [run-auth-trade-integration-demo.ps1](../Services/auth-service/run-auth-trade-integration-demo.ps1):
  a scripted live demo. It checks the DB and endpoints are up, then registers, logs in, refreshes, calls `/me`,
  triggers the 5-attempt throttle, compares wrong-password timing for known vs unknown users, and shows that a
  `SUSPENDED` account is blocked with `ACC-403` while a `CLOSED` one can still log in.

---

## Part 4: How the service boots

1. `npm start` runs `node dist/main.js`, compiled from [main.ts](../Services/auth-service/src/main.ts).
2. `NestFactory.create(AppModule)` builds the dependency graph:
   - `ConfigModule.forRoot` loads `.env` into `process.env`.
   - `DatabaseModule` creates `DatabaseService`; its `onModuleInit()` resolves the connection string and creates a
     `pg.Pool` (connections open lazily on the first query).
   - `AuthModule` creates every service, repository and guard (singletons) and both controllers.
3. `app.enableCors({ origin: UI_ORIGIN, credentials: true })`: browsers may call this API only from the Angular
   origin. `credentials: true` sends `Access-Control-Allow-Credentials: true`, without which the browser
   refuses to store or send the refresh cookie on cross-origin calls. That header requires an explicit origin,
   never `*`.
4. A global `ValidationPipe` is installed.
5. Swagger is set up: interactive docs at **`http://localhost:3000/docs`**, raw JSON at `/docs-json`.
6. `app.listen(3000)` prints "Auth Service running on port 3000".

The Kafka producer is **not** connected at boot. It connects lazily on the first registration
(`ensureConnected()`).

---

## Part 5: Every endpoint at a glance

| Method + path | Auth | Request DTO | Success | Failure codes | Handler |
|---|---|---|---|---|---|
| `POST /auth/register` | public | `RegisterRequest` | 201 `UserResponse` | 409 `AUTH-409`, 422 `VAL-422`, 400 validation | `AuthController.register` |
| `POST /auth/admin/register` | **public (!)** | `RegisterRequest` | 201 `UserResponse` (ADMIN) | 409, 422 | `AuthController.registerAdmin` |
| `POST /auth/login` | public | `LoginRequest` | 200 `TokenResponse` + sets `refresh_token` cookie | 401 `AUTH-401`, 403 `ACC-403` | `AuthController.login` |
| `POST /auth/admin/login` | public | `LoginRequest` | 200 `TokenResponse` + sets `refresh_token` cookie | 401 `AUTH-401` | `AuthController.loginAdmin` |
| `POST /auth/refresh` | public (needs refresh token: cookie, or body as fallback) | `RefreshRequest` (body may be `{}`) | 200 `TokenResponse` + rotated cookie | 401 `AUTH-401` (+ cookie cleared) | `AuthController.refresh` |
| `POST /auth/logout` | public (refresh token: cookie, or body as fallback) | `RefreshRequest` (body may be `{}`) | 204 + cookie cleared | 422 | `AuthController.logout` |
| `GET /auth/me` | Bearer | none | 200 `UserResponse` | 401 | `AuthController.getMe` |
| `GET /kyc` | Bearer, CUSTOMER | none | 200 `KycResponse` | 401, 403 `AUTH-403`, 404 `KYC-404` | `KycController.getMyKyc` |
| `POST /kyc` | Bearer, CUSTOMER | `CreateKycRequest` | 201 `KycResponse` | 401, 403, 409 `KYC-409`, 422 | `KycController.createKyc` |
| `PUT /kyc` | Bearer, CUSTOMER | `CreateKycRequest` | 200 `KycResponse` | 401, 403, 404, 422 | `KycController.updateMyKyc` |
| `GET /kyc/pending` | Bearer, ADMIN | none | 200 `KycResponse[]` | 401, 403 | `KycController.getPendingKyc` |
| `PATCH /kyc` | Bearer, ADMIN | `UpdateKycRequest` | 200 `KycResponse` (+`accountId` on approval) | 401, 403, 404, 409 `KYC-409`, 422 | `KycController.reviewKyc` |
| `GET /docs` | public | none | Swagger UI | none | Nest Swagger |

"CUSTOMER" on the KYC routes means the token's roles must include `CUSTOMER` **and not** `ADMIN`.

---

## Part 6: The code, file by file

### 6.1 [main.ts](../Services/auth-service/src/main.ts) and [app.module.ts](../Services/auth-service/src/app.module.ts)

Covered in Part 4. `AppModule` has no controllers or providers of its own; it just imports `ConfigModule`,
`DatabaseModule` and `AuthModule`.

### 6.2 [auth/auth.module.ts](../Services/auth-service/src/auth/auth.module.ts)

Registers `AuthController` and `KycController`, and as providers: `TokenService`, `PasswordService`,
`RefreshTokenService`, `TradeApiClient`, `UserRepository`, `KycRepository`, `ThrottleService`,
`AccountProvisioningEventService`, `NotificationService` and `BearerGuard`. The guard **must** be a provider
because it has its own dependency (`TokenService`). `RefreshTokenRepository` and `EmailEncryptionService` are not
registered.

### 6.3 [auth/auth.controller.ts](../Services/auth-service/src/auth/auth.controller.ts): `AuthController`

Constructor-injects 8 dependencies. Every method wraps its work in `try/catch` and returns
`{ errorCode, message }` bodies.

**The refresh cookie.** Above the class, the file defines `REFRESH_COOKIE_NAME = "refresh_token"` and
`REFRESH_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "strict", path: "/auth" }`, plus a small
`readCookie(req, name)` that parses the raw `Cookie` header (no `cookie-parser` dependency; a malformed value is
treated as absent). Three private helpers use them:
- `setRefreshCookie(res, token)`: `res.cookie(...)` with `maxAge = getRefreshTokenExpiry() × 1000` (7 days).
  Called by `login`, `loginAdmin` and `refresh` just before the 200.
- `clearRefreshCookie(res)`: `res.clearCookie(...)` with the same options (the path must match, or the browser
  keeps the cookie).
- `presentedRefreshToken(req, body)`: **the cookie wins**, and `body.refreshToken` is the fallback for clients
  that still send it (a transition period).

`path: "/auth"` means the browser sends the cookie only to `/auth/...` URLs (`/auth/refresh`, `/auth/logout`),
never to `/kyc` or the Trade API. `httpOnly` hides it from page scripts (and from any XSS payload), `secure`
keeps it off plain HTTP (browsers exempt `localhost`), and `sameSite: "strict"` stops other sites from making the
browser send it (CSRF).

| Method | What it does, step by step |
|---|---|
| `register` | username taken? → 409 `AUTH-409`. bcrypt-hash the password → insert `auth.users` with status `PENDING` → assign role `CUSTOMER` → **publish `USER_REGISTERED` to Kafka** → fire-and-forget welcome email → 201 `{ id, username, roles: ['CUSTOMER'] }`. On any exception: **delete the user that was just created** (compensation) and return 422 `VAL-422`. Any `roles` in the request are ignored. |
| `registerAdmin` | same, but status `ACTIVE`, role `ADMIN`, no Kafka event, no email, response `accountId: 0`. **No guard on this route.** |
| `login` | throttled? → 401. Find the user; if missing, still run bcrypt against a **dummy hash** (equal timing). Wrong password or missing user → record a failure → 401. Look up the trading account via `TradeApiClient.getAccountByUserId` (missing → failure + 401). Account `SUSPENDED` → 403 `ACC-403`. Create the access JWT with `accountId` and roles `['CUSTOMER']`. **Revoke all of the user's refresh tokens**, generate a new one, store its bcrypt hash + HMAC lookup hash, reset the throttle → **set the `refresh_token` cookie** → 200 `{ accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 }`. Any exception → 401. |
| `loginAdmin` | same throttle/password/dummy-hash logic, then requires the `ADMIN` role in `auth.user_roles` (no trading account lookup). Token gets `accountId: 0` and the roles from the DB. Sets the refresh cookie too. |
| `refresh` | `presentedRefreshToken` (cookie, else body; neither → 401) → `validateRefreshToken` (exists, not revoked, not expired) → **revoke the presented token** → load the user (missing → 401) → roles from the DB → for non-admins look up the trading account (missing → 401) → new access JWT + new refresh token stored → **set the rotated cookie** → 200. The 401s for no token, an invalid token and a missing user go through a local `unauthorised()` helper that **also clears the cookie**, because a refused refresh ends the session. (The "no trading account" 401 and the catch-all 401 don't clear it; by then the presented token is already revoked, so the stale cookie is useless anyway.) |
| `logout` | `presentedRefreshToken` (cookie, else body) → if there is one, `revokeRefreshToken(token)` → **clear the cookie** → 204. No token, or an unknown token, also gets 204 (no information leak). DB error → 422. |
| `getMe` | protected by `BearerGuard`; `@CurrentUser()` gives the verified claims → read `user_name` from the DB → 200 `{ id: sub, username, accountId, roles }`. `accountId` and `roles` come **from the token**, not the DB. |

### 6.4 [auth/kyc.controller.ts](../Services/auth-service/src/auth/kyc.controller.ts): `KycController`

Every route uses `@UseGuards(BearerGuard)` and then checks roles itself:

- **Customer routes** (`GET`, `POST`, `PUT /kyc`) require `CUSTOMER` and **reject** tokens that also have
  `ADMIN` (403 `AUTH-403`). The user is always `claims.sub`, so a customer can only ever see or edit **their
  own** KYC. No user id is accepted from the request body.
- **Admin routes** (`GET /kyc/pending`, `PATCH /kyc`) require `ADMIN`.

| Method | Behaviour |
|---|---|
| `getMyKyc` | `findByUserId(sub)` → 200, or 404 `KYC-404` |
| `createKyc` | already exists → 409 `KYC-409`; insert with status `PENDING`; fire-and-forget "KYC submitted" email → 201 |
| `updateMyKyc` | `UPDATE … SET …, status = 'PENDING', reviewed_* = NULL, rejection_reason = NULL, submitted_at = now` → 200, or 404 if there was nothing to update. This is how a rejected applicant resubmits. |
| `getPendingKyc` | all `PENDING` rows, oldest first |
| `reviewKyc` | body `{ userId, status: APPROVED|REJECTED, rejectionReason? }`. 404 if no KYC; **409 if already APPROVED**. Update status/reviewer/time/reason. On **APPROVED**: set `auth.users.status = 'ACTIVE'` and call `TradeApiClient.activateAccount(userId)` (trading account PENDING → ACTIVE); the response includes `accountId`. Then fire-and-forget the approved/rejected email. |
| `toKycResponse` (private) | maps the entity to the response DTO |

The frontend's `MockKycService` uses these exactly, through the generated `KYCService` client (built from
`auth-api.yaml`): `GET /kyc` to read, `POST` the first time, `PUT` afterwards, `GET /kyc/pending` and
`PATCH /kyc` for admins.

### 6.5 [guards/BearerGuard.ts](../Services/auth-service/src/guards/BearerGuard.ts)

1. **Find a token** in this order:
   - `Authorization` header: `Bearer <jwt>` (case-insensitive). A bare value without `Bearer` is also accepted.
   - `x-access-token` header.
   - `Cookie` header: `accessToken=` or `token=`. (The `refresh_token` cookie is never accepted as an access
     token. Its `Path=/auth` also keeps browsers from sending it to `/kyc`.)
2. No token → throw `UnauthorizedException({ errorCode: 'AUTH-401', message: 'Unauthorised' })`.
3. `TokenService.verifyAccessToken(token)`: `jwt.verify` with algorithm **HS256 only**, the secret and the
   issuer. A bad signature, wrong issuer, wrong algorithm or expiry → 401.
4. Valid → `request.user = payload` → `true`.

The signature is verified **before** any claim is used. Restricting `algorithms: ['HS256']` prevents the
classic "alg: none" / algorithm-confusion attacks.

### 6.6 [guards/CurrentUser.ts](../Services/auth-service/src/guards/CurrentUser.ts)

`createParamDecorator` that returns `request.user` (or one field of it with `@CurrentUser('sub')`). It never
verifies anything itself; it only exposes what `BearerGuard` already verified. It also defines the
`AuthenticatedUser` interface: `{ sub, accountId, roles, iat, exp, iss }`.

### 6.7 Services: [src/services/](../Services/auth-service/src/services/)

#### `TokenService`

- `createAccessToken(sub, accountId, roles)` builds exactly six claims, `sub`, `accountId`, `roles`, `iat`, `exp`
  (= iat + 900) and `iss`, and signs them with HS256. **There is no username, email or password in the token**,
  and the tests assert this.
- `createInternalAccessToken()` builds `{ service: 'auth-service', scope: 'trade-internal', iat, exp: +60s, iss }`
  for calls to the Trade API's `/internal/...` endpoints.
- `verifyAccessToken(token)` returns `{ valid, payload? , error? }`.
- `decodeToken` (decode without verifying; only tests use it), `getAccessTokenExpiry()`, `getRefreshTokenExpiry()`.

#### `PasswordService`

- `hashPassword` uses **bcrypt with cost 12** (2^12 rounds, salted, deliberately slow).
- `verifyPassword` uses `bcrypt.compare`.
- `getDummyHash` returns a fixed, valid-format bcrypt hash used when the username doesn't exist, so the response
  takes as long as a real wrong password. This prevents finding valid usernames by **timing**.

#### `RefreshTokenService` and [repositories/RefreshTokenRepository.ts](../Services/auth-service/src/repositories/RefreshTokenRepository.ts)

The refresh token is **opaque**: 32 random bytes as 64 hex chars (`crypto.randomBytes`), not a JWT. Its
plaintext is returned to the client once and **never stored**. Two derived values are stored:

| Column | Value | Why |
|---|---|---|
| `token_hash` | `bcrypt(token, cost 10)` | slow, salted hash; a DB leak doesn't reveal usable tokens |
| `lookup_hash` | `HMAC-SHA256(TOKEN_LOOKUP_SECRET, token)` | **deterministic**, so it can be indexed for an O(1) `WHERE lookup_hash = $1` |

Why both? Bcrypt is salted, so hashing the same token twice gives different strings, and you can't search for
it. The HMAC finds the row fast; bcrypt then does the final check. (The older `AUTH_README.md` describes the
previous approach, which scanned every row with `bcrypt.compare`. Migration `015` replaced it.)

Methods:
- `generateRefreshToken()`, `hashRefreshToken()`, `storeRefreshToken(userId, hash, plain)` (expiry = now + 7 days)
- `validateRefreshToken(token)` → `{ valid, userId?, error? }`: not found / revoked / expired → invalid
- `revokeRefreshToken(token)`: find the row, `UPDATE … SET is_revoked = TRUE WHERE id = $1`
- `revokeAllRefreshTokensForUser(userId)`: used on every login
- `getActiveRefreshTokenForUser` (not used by the controllers)

`findByPlainToken` already filters `is_revoked = FALSE AND expires_at > now`, so a revoked or expired token
simply comes back "not found". Either way it's a 401.

#### `ThrottleService`

An in-memory `Map<username, { attempts, lastAttempt, blockedUntil? }>`:
- `recordFailedAttempt`: the 5th failure within an hour sets `blockedUntil = now + 15 minutes`
- `isThrottled`: true while blocked (even with the **correct** password); clears the entry when the block expires
- `resetThrottle`: called on successful login
- the counter resets if more than 1 hour passes between failures

#### `TradeApiClient`

HTTP calls (built-in `fetch`) to the Trade API's internal endpoints, each with a **fresh internal service token**:

| Method | Call | Used by |
|---|---|---|
| `getAccountByUserId(userId)` | `GET /internal/accounts/by-user/{userId}` (404 → `null`) | login, refresh |
| `activateAccount(userId)` | `PATCH /internal/accounts/by-user/{userId}/activate` | KYC approval |
| `createAccount(userId)` | `POST /internal/accounts` | **unused** (account creation moved to Kafka) |

Non-OK responses throw `HttpException({ errorCode: 'AUTH-500' }, 500)`.

#### `AccountProvisioningEventService`

A Kafka producer (`kafkajs`, clientId `auth-service`). `publishUserRegistered(userId, username)` sends to the
topic `user-registrations` with **key = userId** (so all events for one user land on the same partition, in
order):

```json
{ "eventId": "<uuid>", "eventType": "USER_REGISTERED", "eventTime": "<ISO>", "source": "auth-service",
  "schemaVersion": 1, "payload": { "userId": "<uuid>", "username": "priya" } }
```

The **order-service** (`UserRegisteredEventConsumer.java`) consumes it and creates a trading account with
balance 0.00 and status `PENDING`. The producer connects lazily and disconnects in `onModuleDestroy`.

#### `NotificationService`

Sends four plain-text emails via `nodemailer`: welcome, KYC submitted, KYC approved, KYC rejected (with the
reason). Design rules:
- **best effort**: `send()` catches everything and never throws; callers use `void this.notificationService…`
  (fire-and-forget), so a mail outage never fails registration or KYC
- `SMTP_HOST` unset → every email is skipped with a log line (no mail server needed locally or in tests)
- **never logs the address or body** (PII), only the user id
- skips legacy `@placeholder.local` addresses

#### `EmailEncryptionService`

AES-256-GCM `encrypt`/`decrypt` producing `ivHex:authTagHex:dataHex`, with a random 12-byte IV per value and the
key from `EMAIL_ENCRYPTION_KEY`. It is fully unit-tested, and migration `011` prepared the DB for it, **but no
code calls it**. See Part 13.

### 6.8 Repositories: [src/repositories/](../Services/auth-service/src/repositories/)

All SQL uses **parameterised queries** (`$1, $2…`), so values are never concatenated into SQL. That's the
defence against SQL injection.

- **`UserRepository`** (`auth.users`, `auth.user_roles`): `findByUsername`, `findByUserId`, `create`
  (`RETURNING *`), `isUsernameTaken`, `assignRole` (`ON CONFLICT DO NOTHING`), `getRoles`, `hasRole`,
  `updateStatus`, `deleteById`; `mapRowToUser` converts snake_case columns to camelCase.
- **`KycRepository`** (`auth.kyc`): `findByUserId`, `createSubmission`, `updateSubmissionByUserId` (resets to
  PENDING), `reviewSubmission`, `findAllPending` (oldest first).
- **`RefreshTokenRepository`**: covered above. It's created with `new` inside `RefreshTokenService` rather than
  injected.

### 6.9 [database/](../Services/auth-service/src/database/)

`DatabaseService` holds a single `pg.Pool` and exposes `query(text, params)` and `getPool()`.
`resolveConnectionString()` prefers `AUTH_DB_URL`, then `DB_URL`, from the process environment. If that value has
no password, it falls back to the `.env` file's value. It **fails fast** at startup if no usable connection
string (with user + password) exists.

### 6.10 Entities and DTOs

- **Entities** ([entities/](../Services/auth-service/src/entities/)) are plain TS interfaces for DB
  rows. `User.status` is one of `PENDING` (awaiting KYC), `ACTIVE`, `BLOCKED`, `DEACTIVATED`.
- **DTOs** ([dtos/](../Services/auth-service/src/dtos/)) are classes with validation and Swagger
  decorators:

| DTO | Rules |
|---|---|
| `RegisterRequest` | username 3–64 `^[a-zA-Z0-9._-]+$`; password 12–128; email valid ≤ 254; first/last name 1–80; phone `^\+?[1-9]\d{7,14}$`; optional `roles` (ignored) |
| `LoginRequest` | username ≤ 64, password ≤ 128 |
| `RefreshRequest` | `refreshToken` **optional** string (`@IsOptional() @IsString()`). Browsers send `{}` and rely on the cookie; the field is kept for non-browser clients. The contract (`auth-api.yaml`) no longer lists it as required |
| `CreateKycRequest` (POST and PUT) | `dateOfBirth` ISO date; `documentType` 2–50; `documentNumber` 3–100 |
| `UpdateKycRequest` (admin PATCH) | `userId` UUID; `status` APPROVED/REJECTED; `rejectionReason` ≤ 500 |
| `TokenResponse` | `accessToken`, `refreshToken`, `tokenType` 'Bearer', `expiresIn` 900. (The same refresh token is also set as the cookie; the Angular app ignores the body copy) |
| `UserResponse` | `id`, `username`, `accountId?`, `roles`, `createdOn?` |
| `KycResponse` | id, userId, status, dateOfBirth, documentType/Number, submittedAt, reviewedAt/By, rejectionReason, `accountId?` |
| `ErrorResponse` | `errorCode`, `message` |

The frontend's register form uses **the same rules** as `RegisterRequest`, so users see errors before the request
is sent. The backend still re-validates, because client-side checks can be bypassed.

---

## Part 7: The database tables

All are in the PostgreSQL schema **`auth`** of the shared `trading_system` database (migrations in
[Application/Databases/PostgreSQL/migrations/](../Databases/PostgreSQL/migrations/)).

| Table | Key columns | Created/changed by |
|---|---|---|
| `auth.users` | `user_id UUID PK default gen_random_uuid()`, `user_name`, `password_hash`, `email TEXT`, `phone`, `first_name`, `last_name`, `status` | `008` (copied from `trading.users`), `009` (restored the PK + UUID default lost by `CREATE TABLE AS`), `011` (email → TEXT, unique dropped for ciphertext) |
| `auth.user_roles` | PK `(user_id, role)`, `role IN ('CUSTOMER','ADMIN')`, FK → users ON DELETE CASCADE | `013` |
| `auth.kyc` | `id BIGSERIAL`, `user_id UUID UNIQUE` (one KYC per user), `status IN (PENDING, APPROVED, REJECTED)`, `date_of_birth DATE`, document fields, `submitted_at`, `reviewed_at`, `reviewed_by` FK → users, `rejection_reason`; CHECK: REJECTED requires a reason | `012` |
| `auth.refresh_tokens` | `id BIGSERIAL`, `user_id`, `token_hash UNIQUE`, `lookup_hash UNIQUE`, `is_revoked`, `created_at`, `expires_at` (CHECK expires > created) | `006`, moved by `008`, `lookup_hash` + indexes by `015` (which also revoked all old tokens) |

The `ON DELETE CASCADE` foreign keys are what make the registration compensation (`deleteById`) clean: deleting
the user also removes its roles and KYC.

Trading accounts live in `trading.trading_accounts` and are owned by the order-service. The auth service only
reaches them over HTTP.

---

## Part 8: Flows end to end

### Flow 1: Register

**Scenario:** Priya fills in the Angular register form, which sends `POST /auth/register`.

1. CORS allows `http://localhost:4200`. The `ValidationPipe` builds a `RegisterRequest` and validates it. A bad
   phone or a password that's too short gets a 400 before any code runs; unknown extra fields also get a 400.
2. [auth.controller.ts](../Services/auth-service/src/auth/auth.controller.ts) `register()`:
   1. `userRepository.isUsernameTaken('priya')`: taken → **409 `AUTH-409`**. The frontend shows it on the
      username field.
   2. `passwordService.hashPassword()`: bcrypt, cost 12.
   3. `userRepository.create({... status: 'PENDING'})` → `INSERT INTO auth.users … RETURNING *`. A new UUID is
      generated by the DB.
   4. `assignRole(userId, 'CUSTOMER')`.
   5. `accountProvisioningEventService.publishUserRegistered(userId, 'priya')` → Kafka `user-registrations`.
   6. `void notificationService.sendUserRegistered(...)`: the welcome email, not awaited.
   7. **201** `{ id, username: 'priya', roles: ['CUSTOMER'] }`. **No tokens**: the user must sign in.
3. **If any step from 3–5 throws** (e.g. Kafka is down): `deleteById(createdUserId)` removes the half-created user
   (cascading to roles) and the response is **422 `VAL-422`**. That way the user is never left in a state where
   no trading account will ever be created.
4. **Asynchronously:** the order-service consumes the event and inserts a `PENDING` trading account. Until then,
   login returns 401, which is why the e2e helper retries sign-in for a few seconds.

### Flow 2: Customer login

**Scenario:** Priya signs in, sending `POST /auth/login { username, password }`.

1. `throttleService.isThrottled('priya')` → if locked: **401** (deliberately the same body as a wrong password).
2. `findByUsername`. If the user exists, `bcrypt.compare(password, hash)`. If not, compare against the **dummy
   hash** anyway, so both paths take ~the same time.
3. Bad credentials → `recordFailedAttempt` → **401 `AUTH-401` "Unauthorised"**. (The 5th failure locks the
   username for 15 minutes.)
4. `tradeApiClient.getAccountByUserId(userId)`:
   1. `tokenService.createInternalAccessToken()` creates a 60-second token with `scope: trade-internal`.
   2. `GET {TRADE_API_URL}/internal/accounts/by-user/{userId}` with `Authorization: Bearer <internal token>`.
   3. 404 → no account yet → failure + **401**.
5. `accountStatus === 'SUSPENDED'` → **403 `ACC-403` "You are blocked from using this service."** No tokens are
   issued or rotated. (`PENDING` accounts **can** log in, which is necessary so the user can submit KYC.)
6. `createAccessToken(userId, account.accountId, ['CUSTOMER'])`.
7. `revokeAllRefreshTokensForUser(userId)` invalidates the user's other sessions' refresh tokens.
8. New refresh token: generate 64 hex chars → bcrypt hash + HMAC lookup hash → `INSERT auth.refresh_tokens`.
9. `resetThrottle('priya')`.
10. `setRefreshCookie`: `Set-Cookie: refresh_token=<token>; Max-Age=604800; Path=/auth; HttpOnly; Secure;
    SameSite=Strict`. The UI sends login `withCredentials`, so the browser stores it.
11. **200** `{ accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 }`.

The frontend keeps only the access token, in memory. It then decodes the JWT for `sub`/`accountId`/`roles`, calls `GET /auth/me`, then `GET /kyc` to
decide where to go.

### Flow 3: `GET /auth/me`

1. `BearerGuard`: extract the token → `jwt.verify(HS256, secret, issuer)` → `request.user = payload`. Anything
   wrong → **401** `{ errorCode: 'AUTH-401', message: 'Unauthorised' }`.
2. `getMe(@CurrentUser() claims)` → `findByUserId(claims.sub)` for the username.
3. **200** `{ id: sub, username, accountId: claims.accountId, roles: claims.roles }`.

### Flow 4: Refresh (rotation)

**Scenario:** the 15-minute access token has expired, so the frontend interceptor sends `POST /auth/refresh`
with an empty body `{}`. The browser attaches `Cookie: refresh_token=<token>`. (The Angular app also makes this
call once on every page load to restore the session, because it keeps the access token only in memory.)

0. `presentedRefreshToken(req, body)`: the cookie if present, else `body.refreshToken`. Neither → **401** and
   the cookie is cleared.
1. `validateRefreshToken(token)` → `RefreshTokenRepository.findByPlainToken`:
   `SELECT … WHERE lookup_hash = HMAC(token) AND is_revoked = FALSE AND expires_at > now`, then
   `bcrypt.compare(token, row.token_hash)`. No match → **401**, and the cookie is cleared.
2. `revokeRefreshToken(token)`: `UPDATE … SET is_revoked = TRUE WHERE id = <row id>`. **The presented token is
   now dead.**
3. Load the user (deleted → 401) and their **current roles from the DB**.
4. Non-admins: look up the trading account again (gone → 401). Admins: `accountId = 0`.
5. Issue a new access token + a new refresh token (stored hashed) → **set the cookie to the new refresh token**
   → **200**. The browser replaces its cookie, so rotation needs no work from the page.
6. **Replay:** presenting the old token again finds no active row → **401**. This is why the frontend shares a
   single in-flight refresh between concurrent requests: a second, parallel refresh with the same token would
   fail.

Because `accountId` and roles are re-read here, a refresh picks up a trading account that was provisioned after
the original login.

### Flow 5: Logout

`POST /auth/logout {}` (cookie attached by the browser; a body `refreshToken` is the fallback) →
`revokeRefreshToken` if a token was presented → `clearRefreshCookie` → **204**. The access token is a stateless
JWT, so it remains technically valid until it expires (≤ 15 minutes). The frontend drops it from memory; the
server can't revoke it without a blocklist.

### Flow 6: Submit KYC

**Scenario:** Priya (role CUSTOMER) submits her passport.

1. The frontend first calls `GET /kyc` → **404 `KYC-404`** (nothing yet), so it sends `POST /kyc`.
2. `BearerGuard` → claims. Role check: CUSTOMER and not ADMIN, otherwise **403 `AUTH-403`**.
3. Existing KYC for `claims.sub` → **409 `KYC-409`**. Load the user.
4. `INSERT INTO auth.kyc (user_id, status 'PENDING', …)`.
5. Fire-and-forget the "KYC submitted - awaiting approval" email.
6. **201** `KycResponse` with `status: 'PENDING'`.

**Editing later** (`PUT /kyc`) overwrites the details and puts the record back to `PENDING`, clearing any
reviewer and rejection reason. This is the resubmission path after a rejection.

### Flow 7: Admin login and KYC review

1. `POST /auth/admin/login`: the same password, throttle and dummy-hash logic as the customer login, **plus**
   `hasRole(userId, 'ADMIN')`. Customers get 401. There's no trading account lookup; the token has
   `accountId: 0` and `roles: ['ADMIN']`.
2. `GET /kyc/pending` (ADMIN only) → all PENDING submissions, oldest first.
3. `PATCH /kyc { userId, status: 'APPROVED' }`:
   1. role check ADMIN, else 403
   2. no KYC → 404; already APPROVED → **409 `KYC-409`**
   3. `reviewSubmission` sets status, `reviewed_at = now`, `reviewed_by = admin's sub`, and the reason (only for
      REJECTED)
   4. **APPROVED only:** `users.status = 'ACTIVE'` and `TradeApiClient.activateAccount(userId)` →
      `PATCH /internal/accounts/by-user/{userId}/activate` (trading account PENDING → ACTIVE)
   5. fire-and-forget the approved/rejected email
   6. **200** `KycResponse` + `accountId`
4. **Reject:** `{ status: 'REJECTED', rejectionReason: 'Document is blurry' }`. The DB constraint requires a
   reason for REJECTED rows; the frontend sends "No reason provided" when the admin leaves it empty.

### Flow 8: Brute-force lockout

1. Five wrong passwords for `priya` within an hour → `blockedUntil = now + 15 min`.
2. The sixth attempt, **even with the correct password**, gets 401 at step 1 of the login flow.
3. After 15 minutes the entry is cleared. A successful login always resets the counter.

`ThrottleService.spec.ts` and the PowerShell demo both show this. (The Playwright lockout test was removed when
the e2e suite was trimmed; it needed a throw-away user per run.)

### Flow 9: Server-to-server call to the Trade API

1. `TokenService.createInternalAccessToken()` signs `{ service: 'auth-service', scope: 'trade-internal', exp: now+60 }`
   with `JWT_SECRET`.
2. `TradeApiClient` sends it as a Bearer token to `/internal/accounts/...`.
3. The order-service's `InternalAccountController` accepts only tokens with that internal scope. Customer tokens
   are refused. (The frontend's e2e suite used to check this; that test was removed when the suite was trimmed,
   so it is now covered only by the order-service's own tests.)

Why not reuse the customer's JWT? Least privilege: internal operations like "activate any account" must not be
callable with a customer credential, and the internal token is very short-lived.

---

## Part 9: Security design

| Concern | How it's handled | Where |
|---|---|---|
| Password storage | bcrypt, cost 12, salted | `PasswordService` |
| Username enumeration (response) | the same `AUTH-401 "Unauthorised"` for unknown user, wrong password, missing account, throttled | `AuthController.login/loginAdmin` |
| Username enumeration (timing) | bcrypt against a dummy hash for unknown users | `PasswordService.getDummyHash` |
| Brute force | 5 failures/hour → 15-minute lock per username | `ThrottleService` |
| Token forgery | HS256 signature + issuer check; `algorithms: ['HS256']` pinned | `TokenService.verifyAccessToken`, `BearerGuard` |
| Token contents | only `sub, accountId, roles, iat, exp, iss`; no PII | `TokenService` + tests |
| Short exposure window | access 15 minutes; internal token 60 seconds | env defaults |
| Refresh token theft from DB | only a bcrypt hash + HMAC are stored | `RefreshTokenService/Repository` |
| Refresh token replay | single-use rotation: revoked on every refresh (sequential replay only; two concurrent presentations can both succeed, see Part 13 item 19) | `AuthController.refresh` |
| Refresh token theft in the browser (XSS) | delivered as an `HttpOnly` cookie that page scripts can't read; the Angular app keeps nothing token-shaped in web storage | `REFRESH_COOKIE_OPTIONS`, `setRefreshCookie` |
| Refresh cookie misuse (CSRF, leakage) | `SameSite=Strict` (no cross-site sends), `Path=/auth` (never sent to `/kyc` or the Trade API), `Secure` (HTTPS only, except `localhost`) | `REFRESH_COOKIE_OPTIONS` |
| Stolen session cleanup | login revokes all of the user's refresh tokens; logout revokes one | `AuthController.login/logout` |
| Privilege escalation via registration | public `register` ignores `roles` and always assigns CUSTOMER | `AuthController.register` (but see `admin/register` in Part 13) |
| Horizontal access (other users' data) | customer KYC routes use `claims.sub` only, never a user id from the request | `KycController` |
| Vertical access (admin functions) | role checks on `/kyc/pending` and `PATCH /kyc` | `KycController` |
| SQL injection | parameterised queries everywhere | repositories |
| Mass assignment / junk input | `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` | `main.ts` |
| Browser cross-origin abuse | CORS restricted to `UI_ORIGIN`; `credentials: true` (cookies) only for that explicit origin | `main.ts` |
| PII in logs | notification logs carry the user id only | `NotificationService` |
| Service-to-service auth | separate scoped, short-lived internal token | `TokenService`, `TradeApiClient` |

---

## Part 10: Error codes

Every error body (except `ValidationPipe` 400s) is `{ "errorCode": "...", "message": "..." }`.

| HTTP | Code | When |
|---|---|---|
| 400 | (Nest default body) | DTO validation failed or unknown fields were sent |
| 401 | `AUTH-401` | missing/invalid/expired token; bad credentials; throttled; no trading account; refresh token invalid; unexpected login/refresh/me error |
| 403 | `ACC-403` | login with a SUSPENDED trading account |
| 403 | `AUTH-403` | wrong role for a KYC route |
| 404 | `KYC-404` | no KYC record |
| 409 | `AUTH-409` | username already registered |
| 409 | `KYC-409` | KYC already submitted (POST) or already approved (PATCH) |
| 422 | `VAL-422` | registration/KYC/logout failure caught by the catch-all |
| 500 | `AUTH-500` | thrown by `TradeApiClient` on a failed Trade API call (usually caught and remapped by the controllers) |

The frontend's `ErrorMappingService` turns `AUTH-401`, `AUTH-409`, `ACC-403` and `VAL-422` into friendly
sentences.

---

## Part 11: Testing

Jest unit tests, 145 cases in 13 spec files, run with `npm test`. Three styles are used:

1. **Pure unit tests with mocks.** `auth.controller.spec.ts` and `kyc.controller.spec.ts` build the controller
   with `jest.fn()` mocks for every dependency and a fake `res` object, then assert status codes, bodies and
   which dependencies were or weren't called. Examples: "returns 409 and does not hash or create anything for a
   taken username", "deletes created user when event publishing fails", "rejects a suspended account without
   issuing or rotating tokens", "still returns 200 when the approval email cannot be sent". The fake `res` has
   `cookie`/`clearCookie` mocks, so login asserts the exact cookie options and logout asserts the cookie is
   cleared (including "revokes the token from the HttpOnly cookie when the body is empty").
2. **Real services, fake storage.** `auth.controller.refresh.spec.ts` uses the real `TokenService` and
   `RefreshTokenService` with an **in-memory `refresh_tokens` table** to prove rotation, hashing and replay
   refusal end to end. It also covers the cookie: a refresh from the `refresh_token` cookie alone rotates the
   cookie, the cookie wins over a stale body token, and a request with neither gets 401 and a cleared cookie.
   (`refresh(body, req, res)` now takes the Express request too; tests pass `{ headers: { cookie: … } }`.)
3. **Security property tests.** `TokenService.spec.ts` asserts the token has *exactly* six claims and no
   email/username/password; `BearerGuard.spec.ts` uses a genuinely expired token and a correctly-formed token
   signed with the wrong key; `PasswordService.spec.ts` asserts the hash isn't an MD5/SHA digest.

| Spec | Cases |
|---|---|
| `TokenService.spec.ts` | 26 |
| `auth.controller.spec.ts` | 25 |
| `RefreshTokenService.spec.ts` | 14 |
| `kyc.controller.spec.ts` | 14 |
| `ThrottleService.spec.ts` | 11 |
| `UserRepository.spec.ts` | 10 |
| `TradeApiClient.spec.ts` | 10 |
| `database.service.spec.ts` | 8 |
| `BearerGuard.spec.ts`, `auth.controller.refresh.spec.ts` | 7 each |
| `EmailEncryptionService.spec.ts`, `NotificationService.spec.ts` | 5 each |
| `PasswordService.spec.ts` | 3 |

Live end-to-end coverage comes from the frontend's Playwright suite (`login`, `register`, `kyc`, `admin`,
`session`, `token-refresh`), which runs against this service for real.

---

## Part 12: Commands cheat sheet

Run from `Application/Services/auth-service/`:

```bash
npm ci                      # install dependencies
cp .env.example .env        # then fill in DB URL, JWT_SECRET, etc.
npm run dev                 # watch mode on :3000
npm run build && npm start  # compiled run
npm test                    # unit tests
npm run test:coverage       # tests + coverage
npx tsc --noEmit            # type-check only

# open the API docs
#   http://localhost:3000/docs

# quick manual checks
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
     -d '{"username":"<user>","password":"<password>"}'
curl http://localhost:3000/auth/me -H "Authorization: Bearer <accessToken>"
curl -i -X POST http://localhost:3000/auth/refresh -H "Content-Type: application/json" \
     -d '{"refreshToken":"<refreshToken>"}'   # body fallback; -i shows the rotated Set-Cookie: refresh_token=…

# Docker
docker build -t auth-service .
docker run -p 3000:3000 --env-file .env auth-service

# scripted demo (PowerShell; needs Postgres + Trade API up)
./run-auth-trade-integration-demo.ps1
```

**Dependencies at runtime:** PostgreSQL (with migrations applied), the Trade API on `TRADE_API_URL` (for login,
refresh and KYC approval), Kafka (for registration) and, optionally, SMTP.

---

## Part 13: Known issues, risks and technical debt

Ordered roughly by severity. Each one is an observation about the current code, phrased so you can discuss it in
a review.

1. **`POST /auth/admin/register` is unauthenticated.** It has no `BearerGuard` and no role check, so anyone who
   can reach the service can create an `ADMIN` user, sign in through `/auth/admin/login`, and approve KYC. The
   fix is to remove it from the public API (seed admins via migration/CLI) or guard it with
   `BearerGuard` + an ADMIN check.
2. **Emails are stored in plaintext.** `EmailEncryptionService` exists and is tested, migration `011` prepared the
   column, and `RegisterRequest`/`AUTH_README.md` say emails are AES-encrypted, but `UserRepository.create`
   inserts the raw email and nothing calls the service (it's not even registered in `AuthModule`).
3. **An internal token is logged in full.** `TradeApiClient.getAccountByUserId` logs `tokenPrefix: internalAccessToken`
   (the whole token; the other two methods log `.slice(0, 16)`). Anyone with log access gets a 60-second
   credential for the internal account endpoints. `TokenService.createInternalAccessToken` also logs on every
   call.
4. **Secrets in the repository.** `.env.example` contains what looks like a real database password, and
   `run-auth-trade-integration-demo.ps1` hard-codes the same DB URL plus user credentials as defaults. `JWT_SECRET`
   has no startup check (a missing secret only fails at the first sign/verify), and `TOKEN_LOOKUP_SECRET` and
   `EMAIL_ENCRYPTION_KEY` silently fall back to well-known defaults.
5. **User and internal tokens share a secret and issuer.** `BearerGuard` doesn't check for a `sub` claim or reject
   `scope: trade-internal`, so a valid internal token would pass the guard (the role checks and missing `sub`
   limit the damage). Separate keys or audiences (`aud`) would make the boundary explicit.
6. **KYC edge cases.**
   - `PUT /kyc` on an **APPROVED** record resets it to `PENDING` (the trading account stays ACTIVE, and the
     frontend guard would then block the user until re-approval).
   - `reviewKyc` isn't atomic: the KYC row is updated to APPROVED and `users.status` to ACTIVE **before**
     `activateAccount`. If the Trade API call fails, the client gets 422 but the DB says APPROVED, and re-review is
     blocked by the "already approved" 409.
7. **The throttle is in-memory and per username.** It resets on restart, isn't shared across multiple instances,
   and lets anyone **lock out any user** for 15 minutes by sending 5 wrong passwords (a denial of service). A
   shared store (Redis/DB) and per-IP limits would address this.
8. **Validation errors don't use the error contract.** `ValidationPipe` failures return Nest's default 400 body
   (`{ statusCode, message: [...], error }`) rather than `{ errorCode: 'VAL-422', … }` with 422. A custom
   `exceptionFactory` would align them.
9. **Catch-alls hide outages.** Database or network failures during login, refresh or `/me` become 401, and during
   registration or KYC become 422. Clients can't tell "wrong password" from "database down", and monitoring sees
   no 5xx responses.
10. **Registration depends on Kafka synchronously, and isn't transactional.** If Kafka is down, registration fails.
    User creation and role assignment are separate statements (compensated by `deleteById`, not by a DB
    transaction). An outbox table would make it robust.
11. **One session per user.** Every login revokes all of the user's refresh tokens, so signing in on a second
    device logs the first one out at its next refresh. Because the Angular app now refreshes on **every page
    load** (the access token lives only in memory), "next refresh" includes the first device's next reload. That's
    a deliberate security choice, but worth knowing (the Playwright `blotter` spec has to sign the browser in again
    after an API login for this reason).
12. **Customer login hard-codes `['CUSTOMER']`** while refresh reads the roles from the DB. `/auth/me` returns roles
    and `accountId` from the token, so they're stale until the next refresh.
13. **Dead or misleading code.**
    - unused: `TradeApiClient.createAccount`, `RefreshTokenService.getActiveRefreshTokenForUser`,
      `TokenService.decodeToken`, `ThrottleService.getThrottleTimeRemaining/getConfiguration`, and the
      `@nestjs/jwt`, `passport*` and `uuid` dependencies
    - the "theft detected" branch in `validateRefreshToken` can't be reached, because the repository query already
      excludes revoked rows
    - `createLookupHash` is duplicated in the service and the repository; the repository is created with `new`
      instead of DI
    - `RegisterRequest.roles` is accepted and ignored
    - `AUTH_README.md` describes the old bcrypt-scan lookup, says the header must be "exactly `Bearer <jwt>`"
      (the guard now also accepts a bare token, `x-access-token` and cookies), and uses `sprint08/` paths
14. **Swagger at `/docs` is public**, which is fine for development but usually disabled or protected in production.
15. **The refresh token is still in the response body.** Login and refresh return `refreshToken` in the JSON
    **and** set it as the HttpOnly cookie. The body copy is kept "during the transition period" for clients that
    still send `{ refreshToken }`. The Angular app ignores it, but any script on the page that can read the
    response (e.g. by wrapping `fetch`/XHR) could still capture the long-lived token, which weakens the point of
    `HttpOnly`. Once no client needs it, the body field (and the body fallback in `presentedRefreshToken`) can go.
16. **The cookie path assumes the service is served at `/auth`.** `Path=/auth` matches the dev setup
    (`http://localhost:3000/auth/...`). The Angular prod build calls `/auth-api/auth/...` through a proxy, and
    `/auth-api/…` doesn't path-match `/auth`, so the browser won't send the cookie unless the proxy rewrites it
    (e.g. nginx `proxy_cookie_path /auth /auth-api/auth;`). `Secure` also requires HTTPS outside `localhost`.
17. **Not every refused refresh clears the cookie.** The "no trading account" 401 and the catch-all 401 in
    `refresh` skip `clearRefreshCookie`. It's harmless, because the token was already revoked or never matched,
    but it's inconsistent with the other 401 paths. Likewise, a DB error in `logout` returns 422 without clearing
    the cookie.
18. **Refresh doesn't re-check a suspended account.** Login refuses a `SUSPENDED` trading account with `ACC-403`,
    but `refresh` only checks that the account exists. A user suspended mid-session keeps getting a new access
    token every 15 minutes until the 7-day refresh token runs out. `refresh` should apply the same status check
    as login.
19. **Rotation is read-then-write, so two concurrent refreshes both win.** `validateRefreshToken` reads the row,
    then `revokeRefreshToken` runs an unconditional `UPDATE … SET is_revoked = TRUE WHERE id = $1`. Two requests
    with the same token can both pass validation and each receive a valid new token, which is exactly the replay
    rotation is meant to stop. Make the revoke the check: `UPDATE … WHERE id = $1 AND is_revoked = FALSE` and
    refuse unless one row changed.
20. **The old token is revoked before the new one exists.** `refresh` revokes the presented token, then loads the
    user and calls the Trade API for the account, then stores the new token. If the Trade API is down or slow at
    that moment, the request fails with 401 and the user's only refresh token is already dead, so every user
    whose access token expires during an outage is signed out. Revoke only after the new token is stored.
21. **A refused refresh can delete a newer cookie.** Two tabs that refresh at the same moment send the same
    cookie. Once item 19 is fixed, one of them is refused, and `unauthorised()` answers with a cookie-clearing
    header. If that response arrives after the winner's, the browser drops the freshly rotated cookie and the
    user is signed out at the next refresh. Either don't clear the cookie on a reuse refusal, or allow a
    just-rotated token a few seconds of grace. (Today both requests succeed because of item 19.)

---

## Part 14: Review questions and answers

**Architecture**

1. **What does this service own?**
   Identity: users, passwords, roles, sessions (JWT + refresh tokens) and KYC. Trading accounts, orders and money
   belong to the Trade API.

2. **Explain the NestJS structure.**
   `main.ts` bootstraps `AppModule`, which imports `ConfigModule`, `DatabaseModule` and `AuthModule`. `AuthModule`
   declares two controllers and the providers. Controllers handle HTTP, services hold logic, repositories run SQL,
   and Nest's DI wires them through constructors.

3. **How does dependency injection work in Nest?**
   Providers are listed in a module; Nest reads constructor parameter types (via `emitDecoratorMetadata`) and
   passes singleton instances in.

4. **What is a DTO and how is it validated?**
   A class describing a request/response body. The global `ValidationPipe` transforms JSON into the class and
   enforces the `class-validator` decorators, rejecting unknown fields.

5. **How does the service talk to other systems?**
   PostgreSQL via `pg`; Kafka (`USER_REGISTERED`) via `kafkajs`; the Trade API's `/internal/accounts` via `fetch`
   with an internal token; SMTP via `nodemailer`.

**Authentication**

6. **Walk through login.**
   Throttle check → find user → bcrypt (or dummy hash) → trading account lookup → suspended check → sign the access
   JWT → revoke old refresh tokens → store the new hashed refresh token → reset the throttle → set the HttpOnly
   `refresh_token` cookie → return the pair.

7. **What's in the JWT and why so little?**
   `sub`, `accountId`, `roles`, `iat`, `exp`, `iss`. JWT payloads are only base64-encoded, so anyone holding the
   token can read them. No PII belongs there, and smaller tokens are cheaper on every request.

8. **How does another service trust the token?**
   It shares `JWT_SECRET` and verifies the HS256 signature, issuer and expiry itself. There's no call back to the
   auth service.

9. **HS256 vs RS256?**
   HS256 uses one shared secret to sign and verify; RS256 signs with a private key and verifies with a public key.
   RS256 would let the Trade API verify without being able to mint tokens. HS256 is simpler but every verifier
   could also forge tokens.

10. **Why is the refresh token not a JWT?**
    It's a server-side, revocable credential. An opaque random value plus a DB row makes revocation and rotation
    trivial; a self-contained JWT can't be revoked without a blocklist.

11. **Why hash refresh tokens, and why two hashes?**
    So a DB leak doesn't hand out live sessions. Bcrypt is salted and therefore can't be searched; the
    deterministic HMAC `lookup_hash` finds the row via an index, then bcrypt confirms it.

12. **What is refresh token rotation?**
    Each refresh revokes the presented token and issues a new one. A stolen token can be used at most once, and a
    replay fails with 401. For browsers, the new token arrives as a replacement `refresh_token` cookie, so the
    page never handles it.

    *Follow-up: why a cookie and not the response body?* An `HttpOnly` cookie can't be read by JavaScript, so an
    XSS bug can't exfiltrate the long-lived credential. `SameSite=Strict` stops cross-site requests from carrying
    it (CSRF), and `Path=/auth` keeps it off every other API. The browser must opt in with `withCredentials`, and
    CORS must allow credentials for the exact UI origin. The cookie wins when a body token is also sent.

13. **What happens on logout?**
    The refresh token (from the cookie, or the body as a fallback) is revoked, the cookie is cleared, and the
    response is 204. The access token stays valid until it expires (≤ 15 minutes), because JWTs are stateless.

14. **How do you prevent username enumeration?**
    Identical 401 bodies for every failure, plus a dummy bcrypt comparison so unknown usernames take as long as
    wrong passwords.

15. **How does brute-force protection work? Weaknesses?**
    5 failures per hour lock the username for 15 minutes. It's in-memory (lost on restart, not shared across
    replicas) and can be abused to lock out other users.

16. **Why is a PENDING trading account allowed to log in but SUSPENDED isn't?**
    PENDING users must sign in to submit KYC; suspension is an explicit block.

17. **How does the guard work?**
    It extracts the token (Authorization / x-access-token / `accessToken`/`token` cookie; never `refresh_token`), verifies it with HS256 + issuer, attaches the
    payload to `request.user`, and `@CurrentUser()` reads it back.

**KYC and provisioning**

18. **Why does registration publish to Kafka instead of calling the Trade API?**
    It decouples the services: the order-service creates the account when it consumes the event, and the auth
    service doesn't need the Trade API to be up at registration time. The trade-off is eventual consistency, so
    login fails until the account exists.

19. **What happens if Kafka is down during registration?**
    Publishing throws, the newly created user is deleted (compensation), and the client gets 422.

20. **How is KYC tied to the trading account?**
    Admin approval sets `users.status = ACTIVE` and calls `PATCH /internal/accounts/by-user/{id}/activate`
    (PENDING → ACTIVE).

21. **How can a customer only see their own KYC?**
    The customer endpoints use `claims.sub` from the verified token and never accept a user id.

22. **Why do customer KYC routes reject admins?**
    Admins have no KYC of their own. Separating the roles avoids an admin accidentally creating or editing a
    record as if they were a customer.

23. **What emails are sent and what if SMTP fails?**
    Welcome, KYC submitted, approved and rejected. They're fire-and-forget; failures are logged (user id only) and
    never fail the request.

**Data and quality**

24. **How is SQL injection prevented?**
    Parameterised queries (`$1`, `$2`) in every repository.

25. **Why did migration 009 exist?**
    `CREATE TABLE … AS TABLE … WITH NO DATA` in 008 copied columns but not the primary key or the UUID default,
    so new users got NULL ids. 009 restored both.

26. **How is the service tested?**
    Jest unit tests with mocked dependencies for the controllers, real token/refresh services over an in-memory
    table for rotation, property tests for token contents and guard behaviour, plus the frontend's Playwright
    journeys against the live service.

27. **What would you fix first?**
    Lock down `/auth/admin/register`, stop logging the internal token, remove secrets from the repo and fail fast
    on missing secrets, wire in email encryption, and make KYC approval atomic.

28. **What does the Dockerfile do?**
    A multi-stage build: compile with dev dependencies, then ship only `dist/` and production dependencies on
    `node:20-alpine`.

---

## Part 15: Glossary

| Term | Meaning |
|---|---|
| **NestJS** | Node.js framework with modules, DI and decorators, built on Express |
| **Controller** | class handling HTTP routes |
| **Provider** | injectable class (service, repository, guard) |
| **Module** | group of controllers and providers |
| **Guard** | runs before a handler; allows or rejects the request |
| **Pipe** | transforms/validates input (`ValidationPipe`) |
| **DTO** | Data Transfer Object: request/response body class |
| **Repository** | class that owns the SQL for a table |
| **JWT** | signed token `header.payload.signature`; the payload carries claims |
| **HS256** | HMAC-SHA256 JWT signature with a shared secret |
| **Claim** | a field inside the JWT (`sub`, `exp`, `roles`…) |
| **Access token** | short-lived JWT sent on every API call |
| **Refresh token** | long-lived, single-use opaque token used to get a new pair |
| **Rotation** | issuing a new refresh token and revoking the old one on every use |
| **HttpOnly cookie** | cookie the browser stores and sends but page JavaScript can't read; carries the refresh token here |
| **SameSite=Strict** | cookie attribute: only sent on same-site requests, which blocks CSRF |
| **CSRF** | cross-site request forgery: another site making the browser send a request that carries your cookies |
| **bcrypt** | slow, salted password-hashing algorithm; "cost" = log2 of the rounds |
| **HMAC** | keyed hash; deterministic, so it's usable as a lookup key |
| **Salt** | random data mixed into a hash so equal inputs hash differently |
| **AES-256-GCM** | authenticated symmetric encryption |
| **KYC** | Know Your Customer: identity verification |
| **Kafka** | event streaming platform; producer → topic → consumer |
| **Compensation** | undoing earlier steps when a later step fails (here: deleting the user) |
| **CORS** | browser rule; the server lists which origins may call it |
| **Throttling** | limiting attempts to slow down brute-force attacks |
| **Swagger / OpenAPI** | machine-readable API description + interactive docs |
