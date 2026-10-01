# Local setup: running the whole platform

Step-by-step setup for a teammate's laptop (Windows, PowerShell). Follow the steps in order.
Each service runs in **its own PowerShell terminal**, and environment variables set with
`$env:...` only apply to the terminal they were typed in.

| Service | Folder | Port | Needs |
|---|---|---|---|
| PostgreSQL | (installed locally) | 5432 | - |
| Kafka (+ Mailpit) | Docker, one shared machine | 9092 (Mailpit 8025) | Docker |
| Trade REST API | `spring-boot-app` | 8080 | Postgres, Kafka |
| Trade Executor | `trade-executor` | 8081 | Postgres, Kafka, Fauxnance |
| Auth Service | `auth-service` | 3000 | Postgres, Kafka, Trade API, SMTP |
| Trading UI | `trading-ui` | 4200 | Auth Service, Trade API |

Start order: **Postgres → Kafka → Trade API → Trade Executor → Auth Service → UI**.

---

## 0. Prerequisites

- **Java 21** (`java -version`)
- **Node.js 20+** and npm (`node -v`)
- **PostgreSQL 16+** running on `localhost:5432`, with `psql` on the PATH
- **Git Bash** (comes with Git for Windows), to run the `.sh` scripts
- **Docker Desktop**, only on the machine that hosts Kafka (see step 2)

---

## 1. Database (once per laptop)

1. Create the database (in psql or pgAdmin):
   ```sql
   CREATE DATABASE trading_system;
   ```
2. Set **your** Postgres password in `sprint09/apply.local.sh` (`POSTGRES_PASSWORD=...`) if it differs.
3. Run the migrations and seed data from **Git Bash**:
   ```bash
   cd sprint09
   ./apply.local.sh
   ```

> **Warning:** `apply.local.sh` **drops the `auth`, `trading` and `public` schemas** before migrating.
> Run it on a fresh database, or when you are happy to lose all local data.

---

## 2. Kafka (one shared broker for the team)

Kafka runs on **one** machine; everyone else just points at it. Skip to 2b if a teammate already hosts it.

### 2a. On the machine that hosts Kafka

1. Find the machine's LAN IP:
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object IPAddress
   ```
2. Start Kafka. `KAFKA_EXTERNAL_HOST` **must be that LAN IP**, not `localhost`, or other
   laptops get redirected to their own `localhost` and cannot connect:
   ```powershell
   cd sprint09
   $env:KAFKA_EXTERNAL_HOST="<HOST_LAN_IP>"     # e.g. 10.8.77.162
   $env:KAFKA_EXTERNAL_PORT="9092"
   docker compose --profile platform up -d
   ```
   This starts `kafka`, then `kafka-topics`, which creates the topics automatically
   (`orders`, `trade-events`, `market-data`, `user-registrations` and their dead-letter topics),
   plus `mailpit`.
3. Check that the topics exist:
   ```powershell
   docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list
   ```
4. Allow other laptops to connect (PowerShell **as Administrator**):
   ```powershell
   New-NetFirewallRule -DisplayName "Kafka 9092" -Direction Inbound -Protocol TCP -LocalPort 9092 -Action Allow
   ```
5. Useful commands:
   ```powershell
   docker compose --profile platform logs -f kafka     # watch logs
   docker compose --profile platform down              # stop
   ```

> If the host's IP changes (new Wi-Fi/VPN), restart Kafka with the new `KAFKA_EXTERNAL_HOST`
> and tell the team the new `<KAFKA_HOST_IP>`.

### 2b. On every other laptop

Nothing to start. Check the shared broker is reachable:
```powershell
Test-NetConnection <KAFKA_HOST_IP> -Port 9092     # TcpTestSucceeded : True
```
Use `KAFKA_BOOTSTRAP_SERVERS=<KAFKA_HOST_IP>:9092` in every service below.

---

## 3. Shared values (must be identical across services)

| Value | Used by | Why it must match |
|---|---|---|
| `JWT_SECRET` | Auth Service, Trade API | Trade API rejects tokens signed with a different secret (`AUTH-401`). |
| `KAFKA_BOOTSTRAP_SERVERS` | Auth Service, Trade API, Trade Executor | All must talk to the same broker. |
| DB name `trading_system` | all backends | One database with `auth` and `trading` schemas. |

Development default for `JWT_SECRET`: `your-256-bit-secret-key-for-hmac-sha256-token-signing`.

---

## 4. Trade REST API (`spring-boot-app`, port 8080)

New terminal:
```powershell
cd sprint09\spring-boot-app
$env:DB_URL="jdbc:postgresql://localhost:5432/trading_system"
$env:DB_USERNAME="postgres"
$env:DB_PASSWORD="<YOUR_DB_PASSWORD>"
$env:KAFKA_BOOTSTRAP_SERVERS="<KAFKA_HOST_IP>:9092"
$env:JWT_SECRET="your-256-bit-secret-key-for-hmac-sha256-token-signing"
.\mvnw.cmd spring-boot:run
```

> Use `localhost` in `DB_URL`, **not** `postgres`. The host name `postgres` only exists inside
> Docker; locally every database call fails with `ERR-500`, and registration never gets a
> trading account, so login fails.

---

## 5. Trade Executor (`trade-executor`, port 8081)

Only needed for placing orders. New terminal:
```powershell
cd sprint09\spring-boot-app          # reuse this folder's Maven wrapper
$env:DB_URL="jdbc:postgresql://localhost:5432/trading_system"
$env:DB_USERNAME="postgres"
$env:DB_PASSWORD="<YOUR_DB_PASSWORD>"
$env:KAFKA_BOOTSTRAP_SERVERS="<KAFKA_HOST_IP>:9092"
$env:KAFKA_CONSUMER_GROUP="trade-executor-group"
$env:FAUXNANCE_BASE_URL="https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1"
$env:FAUXNANCE_API_KEY="<FAUXNANCE_API_KEY>"        # ask the team, never commit it
$env:FAUXNANCE_RETRY_MAX_ATTEMPTS="3"
$env:FAUXNANCE_RETRY_DELAY_MS="500"
$env:POLL_INTERVAL_SECONDS="120000"                 # despite the name, milliseconds: 2 minutes
.\mvnw.cmd -f ..\trade-executor\pom.xml spring-boot:run
```
(If Maven is installed you can instead run `mvn spring-boot:run` inside `trade-executor`.)

---

## 6. Auth Service (`auth-service`, port 3000)

1. Install dependencies (includes `nodemailer` for email):
   ```powershell
   cd sprint09\auth-service
   npm ci
   ```
2. Create `sprint09\auth-service\.env`. It is gitignored, so it is **not** in the repo:
   ```ini
   PORT=3000
   AUTH_DB_URL=postgresql://postgres:<YOUR_DB_PASSWORD>@localhost:5432/trading_system
   JWT_SECRET=your-256-bit-secret-key-for-hmac-sha256-token-signing
   JWT_ISSUER=auth-service
   JWT_ACCESS_TOKEN_EXPIRY_SECONDS=900
   JWT_REFRESH_TOKEN_EXPIRY_SECONDS=604800
   TRADE_API_URL=http://localhost:8080
   KAFKA_BOOTSTRAP_SERVERS=<KAFKA_HOST_IP>:9092
   UI_ORIGIN=http://localhost:4200

   # Email notifications (Gmail)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=<sender>@gmail.com
   SMTP_PASS=<16-char Gmail App Password, no spaces>
   MAIL_FROM=Enterprise Trading Platform <<sender>@gmail.com>
   ```
   - URL-encode special characters in the DB password inside `AUTH_DB_URL` (`!` → `%21`, `@` → `%40`).
   - Variables already set in the terminal **override** `.env`. If something ignores `.env`,
     check the terminal (e.g. `$env:KAFKA_BOOTSTRAP_SERVERS`).
3. Start it:
   ```powershell
   npm run dev
   ```
   `.env` is read only at startup, so restart (Ctrl+C, `npm run dev`) after editing it.

### Email notifications

The service emails the user at the address they register with: on registration, on KYC
submission, and when an admin approves or rejects the KYC.

To get the SMTP password (Gmail):
1. Sign in to the **sender** Gmail account, turn on **2-Step Verification**
   (https://myaccount.google.com/security).
2. Create an **App Password** at https://myaccount.google.com/apppasswords and paste it into
   `SMTP_PASS` without spaces. The normal Gmail password does not work.

Each developer should use their own sender account and App Password. Never commit or post it.

No real inbox? Use Mailpit instead (captures mail locally, inbox at http://localhost:8025):
```ini
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
```
(Start it with `docker compose --profile platform up -d mailpit`, and remove `SMTP_USER`/`SMTP_PASS`.)
Leaving `SMTP_HOST` unset disables email; the service logs `Notification skipped` and keeps working.

`EMAIL_ENCRYPTION_KEY` (optional): stored emails are encrypted with it. If several people share one
database, everyone must use the same key (or none). With your own local database, leave it unset.

---

## 7. Trading UI (`trading-ui`, port 4200)

New terminal:
```powershell
cd sprint09\trading-ui
npm ci
npm start
```
Open http://localhost:4200. The UI calls `http://localhost:3000` (auth) and `http://localhost:8080`
(trade API); no env variables are needed.

---

## 8. Smoke test

1. Register at http://localhost:4200 with a real email → auth-service log shows
   `Notification sent to user ...` and the welcome email arrives (check Spam the first time).
2. Log in → you land on the KYC step (the account starts `PENDING`).
3. Submit KYC → "KYC submitted – awaiting approval" email.
4. Log in as an admin, approve the KYC → "KYC approved" email; the user can now trade.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `client password must be a string` | Auth service has no DB URL | Create `auth-service/.env` with `AUTH_DB_URL`. |
| Register → 422, log shows Kafka `ECONNREFUSED ... localhost:9092` | Wrong or missing Kafka address | Set `KAFKA_BOOTSTRAP_SERVERS=<KAFKA_HOST_IP>:9092`, restart. |
| Login → 401 / `Failed to look up trading account` | Trade API not running, or it can't reach the DB | Start Trade API with `DB_URL` on `localhost`. |
| Trade API calls → `AUTH-401` | `JWT_SECRET` differs between services | Use the same value everywhere. |
| `Notification failed ... ECONNREFUSED 127.0.0.1:1025` | SMTP points at Mailpit but it isn't running | Start Mailpit, or switch to Gmail settings. |
| `Notification failed ... 535 Invalid login` | Not an App Password, or wrong `SMTP_USER` | Create an App Password for the `SMTP_USER` account. |
| `Notification skipped ... SMTP_HOST not configured` | No SMTP settings in `.env` | Add the SMTP block, restart. |
| `Cannot find global type 'Array'` / `Cannot find module ...` | Broken `node_modules` (e.g. disk was full) | Free disk space, delete `node_modules`, run `npm ci`. |
