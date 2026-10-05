# Restructure Map — sprint09 → Application (EXECUTED)

> Status: EXECUTED via COPY (sprint09 kept untouched as backup).
> Rule followed: no new code, no code edits. Only restructuring (copy, no move).
> Date: 2026-10-03

## Target structure (as requested by user)

```
Application/
  1) Frontend/
      1.1) frontend-app/            (Port 4200 — Angular)
  2) Services/
      2.1) auth-service/            (Port 3000 — NestJS)
      2.2) order-service/           (Port 8081 — Spring Boot)
      2.3) executor-service/        (Port 8082 — Spring Boot)
  3) Infrastructure/
      3.1) Kafka/
          3.1.1) scripts/
              3.1.1.1) create-topics.sh
  4) Databases/
      4.1) PostgreSQL/
          4.1.1) schema.sql
          4.1.2) seed-data.sql
          4.1.3) migrations/
      4.2) DuckDB/
          4.2.1) analytics/
              4.2.1.1) schema.sql
  5) ETL_Layer/
  6) Contracts/
      6.1) Analytics-Schemas/
      6.2) Event-Schemas/
      6.3) API-Schemas/
```

> NOTE: Current `Application/` outline on disk is DIFFERENT and must be fixed manually:
> - `Application/Frontend/Services/auth-service|order-service|executor-service` is wrong.
>   Correct is `Application/Services/...` (top-level, sibling of Frontend).
>   Action: create `Application/Services/`, leave `Application/Frontend/` for UI only.

---

## 1. AUTO-COPYABLE (safe to copy as-is with script, excluding junk)

| # | Source (sprint09/…) | Destination (Application/…) | Copy mode |
|---|---------------------|-----------------------------|-----------|
| A1 | `trading-ui/` **excluding** `node_modules/`, `dist/`, `.angular/`, `.idea/` | `Frontend/frontend-app/` | copy whole folder, then `npm ci` fresh in new location |
| A2 | `auth-service/` **excluding** `node_modules/`, `dist/` | `Services/auth-service/` | copy whole folder incl `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, `.env`, `AUTH_README.md` |
| A3 | `spring-boot-app/` **excluding** `target/` | `Services/order-service/` | copy whole folder (proposed: this IS the order-service / Trade REST API — has `OrderController.java`, `WatchlistController.java`, Kafka producer/consumer) |
| A4 | `trade-executor/` **excluding** `target/` | `Services/executor-service/` | copy whole folder (has `OrderPlacedConsumer.java`, `OrderExecutor.java`, poller, DLT handling) |
| A5 | `scripts/create-topics.sh` | `Infrastructure/Kafka/scripts/create-topics.sh` | copy single file, keep executable bit (`chmod +x`) |
| A6 | `migrations/*.sql` (17 files: `001_…` → `016_…` + `015_watchlist_defaults.sql`) | `Databases/PostgreSQL/migrations/` | copy all 17 files verbatim |
| A7 | `etl/` **excluding** `test_local.duckdb`, `__pycache__/`, `.venv/` → `src/trade_etl/*.py`, `tests/`, `pyproject.toml`, `*.py`, `*.md`, `*.ps1` | `ETL_Layer/` | copy whole folder |
| A8 | `etl/src/trade_etl/schema.sql` | `Databases/DuckDB/analytics/schema.sql` | **COPY (not move)** — keep original in ETL_Layer for `source.py`/`pipeline.py` imports; duplicate to DuckDB folder as canonical analytics DDL |
| A9 | `contracts/auth-api.yaml`, `contracts/trade-api.yaml` | `Contracts/API-Schemas/` | copy 2 files |
| A10 | `contracts/kafka-topics.md` | `Contracts/Event-Schemas/` | copy 1 file |
| A11 | `docker-compose.yml` (kafka + kafka-topics + mailpit services only) | `Infrastructure/Kafka/docker-compose.kafka.yml` (reference copy) | copy for reference; full compose split is MANUAL (see M-section) |

Junk that must NEVER be copied (reinstall/regenerate):
- `trading-ui/node_modules/`, `auth-service/node_modules/`, any `dist/`, `.angular/`, `target/` (Maven), `__pycache__/`, `*.pyc`, `etl/test_local.duckdb` (generated binary), `.idea/`, `.vscode/`, `.git/`

---

## 2. MANUAL — needs human decision / hand move (DO NOT auto-copy)

| ID | Source | Issue / Why manual | Proposed destination / action |
|----|--------|--------------------|-------------------------------|
| M1 | `spring-boot-app/` → `order-service` identity | Name mismatch. Evidence says `spring-boot-app` IS the Trade REST API = order-service (depends on `domain-engine`, has order/watchlist/account controllers). But `application.properties` has **no `server.port`** (defaults to 8080) and `auth-service/.env` points at `TRADE_API_URL=http://localhost:8080`, while target spec says **8081**. | Confirm: is `spring-boot-app` = `order-service`? Do NOT change port now (per no-code-change rule). Record port gap for later. |
| M2 | `trade-executor/` port | `trade-executor/src/main/resources/application.yml` says `server.port: 8081`, but target spec says executor = **8082**. | Confirm rename `trade-executor` → `executor-service` with no port change for now. Fix port to 8082 later as separate code-change step. |
| M3 | `domain-engine/` (shared Java lib, used by BOTH `spring-boot-app` and `trade-executor` via Maven `com.tradingsystem:domain-engine:1`) | Not a service. No slot in target 1-6. Moving it inside only one service breaks the other build. | Proposed: `Services/shared-libs/domain-engine/` (new folder, manual `mv` + verify both `pom.xml` still resolve — no edit needed if using local repo, else `mvn install`). ALTERNATIVE: `Services/order-service/libs/domain-engine` + reference from executor — worse. NEEDS your pick. |
| M4 | Current `Application/Frontend/Services/*` (3 empty dirs) | Wrong level per your spec. | Manually: `mkdir Application/Services`, `rmdir Application/Frontend/Services/*`. Keep `Application/Frontend/` for UI only. |
| M5 | `Databases/PostgreSQL/schema.sql` (does NOT exist) + `seed-data.sql` (does NOT exist as single file) | `sprint09/` has `migrations/001-016*.sql` + `seed/001_auth_test_users.sql` + `seed/002_initial_trading_data.sql`. There is no single `schema.sql` / `seed-data.sql` to copy. Auto-concatenating would be "generating code". | Manually decide: (a) leave `schema.sql` as pointer README to `migrations/`, or (b) `pg_dump --schema-only` to generate it later, or (c) designate `migrations/001_initial_trading_schema.sql` as base schema. Same for seed: concat the 2 seed files or keep `seed/` subfolder. |
| M6 | `Contracts/Analytics-Schemas/` (empty — NOTHING in sprint09 matches) | No analytics contract file exists. Closest is `etl/src/trade_etl/schema.sql` (physical DDL, not a contract). | Manually decide: leave empty with `README.md` placeholder, or promote a copy of DuckDB `schema.sql` + document `fact_trades`/`dim_*` as contract later. Do NOT auto-invent. |
| M7 | `services/auth-stub/README.md` | Only file in `services/`; stub is obsolete (real `auth-service/` exists). | Manually: archive to `Application/docs/legacy/auth-stub-README.md` or delete. Do NOT put in `Services/`. |
| M8 | Root ops files: `docker-compose.yml` (full), `Dockerfile`, `apply.sh`, `apply.local.sh`, `.dockerignore` | Compose currently only defines `kafka/kafka-topics/mailpit` — app services are missing. Splitting compose per service is a design decision + env-var wiring (`DB_URL`, `KAFKA_BOOTSTRAP_SERVERS`, `JWT_SECRET`). | Manually: keep one `Application/docker-compose.yml` at root (copy verbatim) + later split, OR create `Infrastructure/Kafka/docker-compose.kafka.yml`. Also decide where `Dockerfile`, `apply*.sh` live (`Application/Infrastructure/` vs root). |
| M9 | Docs: `README.md`, `LOCAL_SETUP.md`, `QUICK_VERIFY.md`, `VERIFICATION_STEPS.md`, `SONARQUBE_SETUP.md`, `order.json`, `design/kafka.md`, `security-review/`, `.claude/`, `trading-ui/prompts/`, `trading-ui/e2e/` | Not in target 1-6. Deleting loses setup/test knowledge; auto-dumping into random folders pollutes structure. | Manually: create `Application/docs/` + move docs there; keep `e2e/` inside frontend-app; keep `prompts/` out of prod image (docs or discard). |
| M10 | `trading-ui/src/generated/` (`auth-client/`, `trade-client/` OpenAPI output) + `openapitools.json` | Generated code. Copying stale clients hides drift from `contracts/*.yaml`. | Manually after move: `npm run generate:clients` in new location and diff. Copy for now but mark GENERATED. |
| M11 | Env/port wiring after move | `auth-service/.env`: `PORT=3000` ✓, `UI_ORIGIN=http://localhost:4200` ✓, but `TRADE_API_URL=http://localhost:8080` ≠ 8081 and `KAFKA_BOOTSTRAP_SERVERS=10.8.76.9:9092` is env-specific. `trading-ui/src/environments/environment*.ts` hardcode API URLs. Any path change (e.g. `trading-ui` → `frontend-app`) can break `angular.json` output paths, `tsconfig` refs, `Dockerfile` COPY paths, Electron/playwright `playwright.config.ts` baseURL. | Manually verify after copy: `ng build`, `nest build`, `mvn -q -DskipTests package` in each new folder. No code edits in this phase — verification only. |

---

## 3. Ports — verification (no change in this phase)

| Service | Source evidence | Target spec | Match? |
|---------|----------------|-------------|--------|
| Frontend | `trading-ui` = Angular, `ng serve` default 4200, `auth-service` CORS `UI_ORIGIN=http://localhost:4200` | 4200 | ✓ |
| auth-service | `src/main.ts`: `process.env.PORT \|\| 3000`, `.env`: `PORT=3000` | 3000 | ✓ |
| order-service (proposed `spring-boot-app`) | `application.properties`: NO `server.port` (= 8080 default); `auth .env TRADE_API_URL=http://localhost:8080` | 8081 | ✗ GAP — do not fix now |
| executor-service (`trade-executor`) | `application.yml`: `server.port: 8081` | 8082 | ✗ GAP — do not fix now |

---

## 4. Proposed execution (ONLY after you approve M1–M11)

```powershell
# 0. Fix outline (manual)
New-Item -ItemType Directory -Path "Application/Services" -Force
# move NOTHING yet; remove wrong-level empties after approval:
# Remove-Item "Application/Frontend/Services" -Recurse -Force

# 1. Auto copies (PowerShell, from repo root, verbatim, no edits):
# Frontend
Copy-Item "sprint09/trading-ui" "Application/Frontend/frontend-app" -Recurse -Exclude node_modules,dist,.angular,.idea
# Services
Copy-Item "sprint09/auth-service" "Application/Services/auth-service" -Recurse -Exclude node_modules,dist
Copy-Item "sprint09/spring-boot-app" "Application/Services/order-service" -Recurse -Exclude target
Copy-Item "sprint09/trade-executor" "Application/Services/executor-service" -Recurse -Exclude target
# Kafka
New-Item -ItemType Directory -Path "Application/Infrastructure/Kafka/scripts" -Force
Copy-Item "sprint09/scripts/create-topics.sh" "Application/Infrastructure/Kafka/scripts/create-topics.sh"
# PostgreSQL
New-Item -ItemType Directory -Path "Application/Databases/PostgreSQL/migrations" -Force
Copy-Item "sprint09/migrations/*.sql" "Application/Databases/PostgreSQL/migrations/"
# ETL + DuckDB (copy, not move)
Copy-Item "sprint09/etl" "Application/ETL_Layer" -Recurse -Exclude __pycache__,test_local.duckdb
New-Item -ItemType Directory -Path "Application/Databases/DuckDB/analytics" -Force
Copy-Item "sprint09/etl/src/trade_etl/schema.sql" "Application/Databases/DuckDB/analytics/schema.sql"
# Contracts
New-Item -ItemType Directory -Path "Application/Contracts/API-Schemas","Application/Contracts/Event-Schemas","Application/Contracts/Analytics-Schemas" -Force
Copy-Item "sprint09/contracts/auth-api.yaml","sprint09/contracts/trade-api.yaml" "Application/Contracts/API-Schemas/"
Copy-Item "sprint09/contracts/kafka-topics.md" "Application/Contracts/Event-Schemas/"

# 2. Verify (no edits): npm ci/build, mvn package, etc. in NEW locations only.
```

`sprint09/` stays untouched as backup until you verify builds in `Application/`.

---

## 5. Execution log (what was actually done)

All operations were COPIES (robocopy / Copy-Item). `sprint09/` was NOT modified.
Excluded junk (never copied): `node_modules/`, `dist/`, `.angular/`, `target/` (Maven),
`__pycache__/`, `*.pyc`, `test_local.duckdb` (generated binary), `.idea/`.

| # | From | To | Result |
|---|------|----|--------|
| A1 | `sprint09/trading-ui/` | `Application/Frontend/frontend-app/` | OK — 148 files |
| A2 | `sprint09/auth-service/` (incl `.env` verbatim + extra `.env.example` copy) | `Application/Services/auth-service/` | OK — 54 files (53 + .env) |
| A3 | `sprint09/spring-boot-app/` | `Application/Services/order-service/` | OK — 78 files |
| A4 | `sprint09/trade-executor/` | `Application/Services/executor-service/` | OK — 72 files |
| A3b | `sprint09/domain-engine/` | `Application/Services/shared-libs/domain-engine/` | OK — 63 files (shared lib, per approval) |
| A5 | `sprint09/scripts/create-topics.sh` | `Application/Infrastructure/Kafka/scripts/create-topics.sh` | OK |
| A6 | `sprint09/migrations/*.sql` (17 files) | `Application/Databases/PostgreSQL/migrations/` | OK — 17 files |
| A6b | `sprint09/seed/*.sql` (2 files) | `Application/Databases/PostgreSQL/seed/` | OK — kept as `seed/` (see M5: single `seed-data.sql` NOT auto-concatenated) |
| A7 | `sprint09/etl/` | `Application/ETL_Layer/` | OK — 12 files |
| A8 | `sprint09/etl/src/trade_etl/schema.sql` | `Application/Databases/DuckDB/analytics/schema.sql` | OK — COPY (original kept in ETL_Layer) |
| A9 | `sprint09/contracts/auth-api.yaml`, `trade-api.yaml` | `Application/Contracts/API-Schemas/` | OK — 2 files |
| A10 | `sprint09/contracts/kafka-topics.md` | `Application/Contracts/Event-Schemas/` | OK |
| A11 | `sprint09/docker-compose.yml` | `Application/Infrastructure/Kafka/docker-compose.kafka.reference.yml` | OK — reference copy only |
| FIX | `Application/Frontend/Services/auth-service|order-service|executor-service` (empty, wrong level) | — | REMOVED; correct top-level `Application/Services/` created |

## 6. Still MANUAL (you must handle — intentionally NOT auto-done)

- [ ] `Databases/PostgreSQL/schema.sql` + `seed-data.sql`: no single files exist in sprint09.
  Seeds live as `PostgreSQL/seed/001_*.sql` + `002_*.sql`; schema lives as `migrations/001-016*.sql`.
  To respect "no new code", nothing was concatenated. Decide: keep `seed/`+`migrations/` as canonical,
  or generate `schema.sql` (`pg_dump --schema-only`) / concat seeds in a follow-up step.
- [ ] `Contracts/Analytics-Schemas/`: EMPTY — no analytics contract exists in sprint09.
  Closest is DuckDB `analytics/schema.sql` (physical DDL). Leave placeholder or promote later.
- [ ] Ports gap (NO code changed, as instructed): `order-service` has no `server.port` (defaults 8080,
  `TRADE_API_URL=http://localhost:8080`) vs spec 8081; `executor-service` is `8081` in `application.yml`
  vs spec 8082. Fix ports as a separate code-change step after you verify builds.
- [ ] Left in `sprint09/` untouched (docs/ops need your triage, NOT auto-moved):
  `services/auth-stub/README.md` (obsolete stub), `design/kafka.md`, `Dockerfile`, `apply.sh`,
  `apply.local.sh`, `.dockerignore`, `README.md`, `LOCAL_SETUP.md`, `QUICK_VERIFY.md`,
  `VERIFICATION_STEPS.md`, `SONARQUBE_SETUP.md`, `order.json`, `security-review/`, `.claude/`,
  `trading-ui/prompts/`. Suggested: new `Application/docs/` for these.
- [ ] Post-move verify (in NEW locations only, no edits): `npm ci && npm run build` (frontend-app),
  `npm ci && npm run build` (auth-service), `mvn -q -DskipTests package` (order-service,
  executor-service after `mvn install` of shared-libs/domain-engine), `pytest` (ETL_Layer).

## 7. Awaiting your decision (was section 5)

- [ ] Confirm `spring-boot-app` = `order-service` (8081) and `trade-executor` = `executor-service` (8082)?
- [ ] Where should `domain-engine/` go? Recommended: `Services/shared-libs/domain-engine/`
- [ ] Fix `Application/Frontend/Services/*` → `Application/Services/*`? (recommended YES)
- [ ] `schema.sql` / `seed-data.sql`: concat now (generates file) or keep `migrations/` + `seed/` as-is with pointer README? (recommended: keep as-is + README, to respect no-new-code rule)
- [ ] Proceed with AUTO copies (A1–A11) now, or map-only for this step?
