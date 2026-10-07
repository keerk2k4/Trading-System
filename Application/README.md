
## 1. Prerequisites (laptop)

- Node 20+, Java 21, Postgres running locally with DB `trading_system`
  (`localhost:5432`, user `postgres` / password `n3u3d4!` per the values below).
- First time only in the NEW folders (folder rename invalidates old installs — do NOT copy `node_modules/`):
  ```powershell
  cd $RepoRoot\Application\Frontend\frontend-app; npm ci
  cd $RepoRoot\Application\Services\auth-service; npm ci
  cd $RepoRoot\Application\Services\shared-libs\domain-engine; ..\..\order-service\mvnw.cmd -q -DskipTests install
  ```
- DB schema/seed live at `Application/Databases/PostgreSQL/migrations/` (17 files)
  and `Application/Databases/PostgreSQL/seed/` — apply them to your local Postgres
  the same way you did from `sprint09/migrations/` + `sprint09/seed/` before.

## 2. Part A — Kafka on the EC2 machine (SSH)

Nothing is broken: `Exited (143)` = clean shutdown (SIGTERM), and all containers
stopped ~simultaneously, so the EC2 host / Docker was stopped or rebooted overnight.
Kafka just needs starting again. Expected topics (8):
`orders`, `trade-events`, `market-data`, `user-registrations` + their `.DLT` copies.

### 2.1 Go to the project folder

New layout (if the EC2 host has the restructured code):

```bash
cd ~/chennai-capstone-SE1-team5/Application/Infrastructure/Kafka
```

Fallback (if EC2 still has the old checkout):

```bash
cd ~/chennai-capstone-SE1-team5/sprint09
```

If "No such file or directory": `find ~ -maxdepth 4 -name docker-compose*.yml` and `cd` into the directory it shows.

### 2.2 Start Kafka with the correct advertised addcress

```bash
export KAFKA_EXTERNAL_HOST=10.8.66.137
export KAFKA_EXTERNAL_PORT=9092
```

Then EITHER (new layout):

```bash
docker compose -f docker-compose.kafka.reference.yml --profile platform up -d --force-recreate kafka kafka-topics
```

OR (old layout on EC2):

```bash
docker compose --profile platform up -d --force-recreate kafka kafka-topics
```

> The reference compose mounts `./scripts/create-topics.sh`, which resolves correctly
> because `scripts/` sits next to the compose file in the new layout too.

### 2.3 Verify (wait ~15 s first)

```bash
docker ps
docker inspect kafka --format '{{range .Config.Env}}{{println .}}{{end}}' | grep ADVERTISED
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list
```

You should see:
- `kafka` with status **Up**
- `EXTERNAL://10.8.75.49:9092` in the ADVERTISED line
- `orders`, `trade-events`, `market-data`, `user-registrations` (+ `.DLT`)

### 2.4 Check from the laptop (PowerShell)

```powershell
Test-NetConnection 10.8.66.137 -Port 9092
```

- `TcpTestSucceeded : True` → Kafka is reachable. Continue with Part B.
- `False` → add the AWS security-group inbound rule (Custom TCP, port **9092**, source **10.8.0.0/16**) and test again.

> Repeat 2.1–2.3 every time the EC2 host is stopped/restarted.
> Symptom on the laptop: Kafka `Connection timeout` / `ECONNREFUSED`, registration failing with 422.

## 3. Part B — services on the laptop (one PowerShell window EACH, in this order)

### 3.1 Order-service / Trade API (port 8080)

```powershell
cd $RepoRoot\Application\Services\order-service
$env:DB_URL="jdbc:postgresql://localhost:5432/trading_system"
$env:DB_USERNAME="postgres"
$env:DB_PASSWORD="n3u3d4!"
$env:KAFKA_BOOTSTRAP_SERVERS="10.8.77.162:9092"
$env:JWT_SECRET="your-256-bit-secret-key-for-hmac-sha256-token-signing"
.\mvnw.cmd spring-boot:run
```

Wait for `Started SpringBootAppApplication` / Tomcat on 8080.

### 3.2 Executor-service (port 8081)

Note: this folder has **no `mvnw.cmd`** — use the wrapper from `order-service`.

```powershell
cd $RepoRoot\Application\Services\executor-service
$env:DB_URL="jdbc:postgresql://localhost:5432/trading_system"
$env:DB_USERNAME="postgres"
$env:DB_PASSWORD="n3u3d4!"
$env:KAFKA_BOOTSTRAP_SERVERS="10.8.77.162:9092"
$env:KAFKA_CONSUMER_GROUP="trade-executor-group"
$env:FAUXNANCE_BASE_URL="https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1"
$env:FAUXNANCE_API_KEY="fnx_dev_CvXEv1ohuj4MUkfZjn0kmyDFguxcvofA"
$env:FAUXNANCE_RETRY_MAX_ATTEMPTS="3"
$env:FAUXNANCE_RETRY_DELAY_MS="500"
$env:POLL_INTERVAL_SECONDS="120000"
..\order-service\mvnw.cmd -f pom.xml spring-boot:run
```

Port comes from `src/main/resources/application.yml` (`server.port: 8081`).

### 3.3 Auth-service (port 3000)

Settings come from `.env`. Confirm this line first (update the IP if yours still shows an old one):

```
KAFKA_BOOTSTRAP_SERVERS=10.8.75.49:9092
```

File: `Application/Services/auth-service/.env` (also saved as `.env.example`).

```powershell
cd $RepoRoot\Application\Services\auth-service
Remove-Item Env:KAFKA_BOOTSTRAP_SERVERS -ErrorAction SilentlyContinue
npm run dev
```

If already running, stop (Ctrl+C) and restart so it picks up the Kafka address.

### 3.4 Frontend (port 4200)

```powershell
cd $RepoRoot\Application\Frontend\frontend-app
npm start
```

Open **http://localhost:4200**:
1. **Register** a new user → auth window logs `Notification sent …`.
2. **Log in** → lands on KYC page.
3. **Submit KYC** → "KYC submitted" email (view at Mailpit `http://localhost:8025` if running).
4. **Log in as admin → approve KYC** → "KYC approved" email.





http://localhost:3000/auth/admin/register

{
  "firstName":"Admin",
  "lastName":"1",
  "email":"keerk2k4@gmail.com",
  "password": "testpassword123",
  "phone":"1234567890",
  "username":"Admin1"
  
}




SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=maddymahesh800@gmail.com
   SMTP_PASS=krgexzbpnebxvlkc
   MAIL_FROM=Enterprise Trading Platform <<sender>@gmail.com>
   ```