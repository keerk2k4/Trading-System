# Trade REST API (order-service): the complete guide

This guide explains the Spring Boot service that the Angular app calls for **accounts, balances, positions,
orders, instruments and watchlists**. It covers every folder, every file, what each one does, and how they work
together. It also covers the shared **domain-engine** library this service depends on, because the order rules
live there.

It uses **real flows** (a trading account being created, an order placed, a watchlist loaded…) to show where
each file comes into play.

- **Code location:** [Application/Services/order-service/](../Services/order-service/) and
  [Application/Services/shared-libs/domain-engine/](../Services/shared-libs/domain-engine/)
- **Companion guides:** [frontend-app-guide.md](frontend-app-guide.md) (the UI that calls this),
  [auth-service-guide.md](auth-service-guide.md) (issues the JWTs this service checks),
  [executor-service-guide.md](executor-service-guide.md) (fills the orders this service accepts)

Package paths are abbreviated: `…/spring_boot_app/` means
`order-service/src/main/java/com/tradingsystem/spring_boot_app/`.

> **Naming:** the folder is `order-service`, the Maven artifact is `spring-boot-app`, the frontend and
> contracts call it the **Trade REST API**, and Kafka events use `source: "trade-api"`. They're all the same
> service.

---

## Table of contents

- [Part 0: The 60-second mental model](#part-0-the-60-second-mental-model)
- [Part 1: Spring Boot crash course (only what this service uses)](#part-1-spring-boot-crash-course-only-what-this-service-uses)
- [Part 2: Folder and file map](#part-2-folder-and-file-map)
- [Part 3: Build, configuration and environment variables](#part-3-build-configuration-and-environment-variables)
- [Part 4: How the service boots](#part-4-how-the-service-boots)
- [Part 5: Every endpoint at a glance](#part-5-every-endpoint-at-a-glance)
- [Part 6: The code, file by file](#part-6-the-code-file-by-file)
- [Part 7: The domain-engine library](#part-7-the-domain-engine-library)
- [Part 8: The database tables](#part-8-the-database-tables)
- [Part 9: Flows end to end](#part-9-flows-end-to-end)
- [Part 10: Security design](#part-10-security-design)
- [Part 11: Error codes](#part-11-error-codes)
- [Part 12: Testing](#part-12-testing)
- [Part 13: Commands cheat sheet](#part-13-commands-cheat-sheet)
- [Part 14: Known issues, risks and technical debt](#part-14-known-issues-risks-and-technical-debt)
- [Part 15: Review questions and answers](#part-15-review-questions-and-answers)
- [Part 16: Glossary](#part-16-glossary)

---

## Part 0: The 60-second mental model

```
 Angular UI ──HTTP + Bearer JWT──►┌──────────── order-service (Spring Boot, :8080) ─────────────┐
                                  │ CorsFilter (order 0) → JwtAuthenticationFilter (order 1)     │
 auth-service ──internal token──► │      /api/v1/** only: verify JWT, put accountId on request    │
   /internal/accounts/**          │                                                              │
                                  │ Controllers: Account · Order · Watchlist · Instrument ·       │
                                  │              InternalAccount                                  │
                                  │      │                                                        │
                                  │ Services: AccountService · OrderService · WatchlistService ·  │
                                  │           InternalAccountService · AuthService                │
                                  │      │            uses domain-engine (OrderValidator, entities)│
                                  │ MyBatis mappers (SQL) ──────────────► PostgreSQL `trading`     │
                                  │                                                              │
                                  │ Kafka: OrderService ──produce──► "orders" ───► trade-executor │
                                  │        UserRegisteredEventConsumer ◄── "user-registrations"   │
                                  │        MarketDataConsumer ◄── "market-data" (from executor)    │
                                  │             └─► LatestPriceCache (in memory) → live prices    │
                                  └──────────────────────────────────────────────────────────────┘
```

Seven ideas explain almost everything:

1. **It is the system of record for trading data**: trading accounts, cash, positions, orders and watchlists, all
   in PostgreSQL schema `trading`.
2. **The account always comes from the JWT.** A servlet filter verifies the token and stores its `accountId`
   claim on the request; controllers never trust an account id from the URL or body.
3. **Placing an order doesn't execute it.** The order is validated, saved as `NEW`, and an `ORDER_PLACED` event
   is published to Kafka **after the DB commit**. The separate **trade-executor** fills or rejects it later.
4. **Business rules live in a framework-free library** (`domain-engine`): `OrderValidator` checks the account is
   active, the cash is enough, holdings are sufficient and the idempotency key is new.
5. **Trading accounts are created from a Kafka event** (`USER_REGISTERED` from the auth service) and **activated
   over an internal HTTP endpoint** when an admin approves KYC.
6. **Live prices are never stored.** They arrive on the `market-data` topic, are kept in an in-memory
   `LatestPriceCache`, and are used to enrich positions, watchlists and instrument search.
7. **SQL is written by hand** in MyBatis annotation mappers. There's no JPA/Hibernate.

---

## Part 1: Spring Boot crash course (only what this service uses)

### 1.1 Spring Boot and beans

`@SpringBootApplication` on [SpringBootAppApplication.java](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/SpringBootAppApplication.java)
turns on **auto-configuration** (Spring sets up the web server, datasource, Kafka, Jackson… from the jars on
the classpath and `application.properties`) and **component scanning** (every class in the package annotated
`@Component`, `@Service`, `@RestController`, `@Configuration` or `@Mapper` becomes a **bean**, a singleton object
Spring manages). `@EnableKafka` turns on `@KafkaListener` processing.

**Dependency injection** is by constructor:

```java
public OrderController(OrderService orders, AuthService authService) { ... }
```

Spring sees the constructor and passes in the beans. It's the same idea as Angular/Nest DI.

### 1.2 Web layer annotations

| Annotation | Meaning |
|---|---|
| `@RestController` | a class whose methods handle HTTP and return JSON |
| `@RequestMapping("/api/v1/orders")` | URL prefix for the class |
| `@GetMapping`, `@PostMapping`, `@PatchMapping`, `@DeleteMapping` | HTTP method + sub-path |
| `@PathVariable("id")` | `{id}` from the URL |
| `@RequestParam("status")` | `?status=` query parameter |
| `@RequestBody` | JSON body → Java object (Jackson) |
| `@Valid` | run Bean Validation on that body |
| `@Validated` (class) + `@Min(1)` on a parameter | validate path/query parameters |
| `ResponseEntity<T>` | lets the method choose the status code (`ok`, `status(CREATED)`, `noContent()`) |
| `@RestControllerAdvice` + `@ExceptionHandler` | one central place mapping exceptions → HTTP errors |
| `@Operation`, `@Tag` | Swagger documentation only (springdoc) |

### 1.3 DTOs as Java records

`public record OrderResponse(String orderId, OrderStatus status, ...) {}` is an immutable data carrier with a
constructor, getters (`orderId()`), `equals`/`hashCode` and `toString` generated. Jackson serialises records to
JSON automatically. Validation annotations (`@NotBlank`, `@Size`, `@DecimalMin`, `@Digits`) sit on the record
components.

### 1.4 Servlet filters (not Spring Security)

This service does **not** use Spring Security. Authentication is a plain servlet **filter**
(`OncePerRequestFilter`) registered with `FilterRegistrationBean`, so it runs before any controller. Filters run
**outside** `@RestControllerAdvice`, which is why the JWT filter writes its own JSON 401 response.

### 1.5 `@Transactional`

Marks a method so Spring opens a DB transaction before it and commits after it (or rolls back on a runtime
exception). It works through a **proxy**: only calls coming **from another bean** go through it. A method calling
another `@Transactional` method on `this` bypasses the proxy, so that inner annotation's settings (like
`REQUIRES_NEW`) are ignored. This matters in `WatchlistService` (Part 14).

`TransactionSynchronizationManager.registerSynchronization(... afterCommit ...)` lets code run **after** the
transaction commits. `OrderService` uses it so the Kafka event is sent only if the order row really committed.

### 1.6 MyBatis (the SQL layer)

MyBatis maps SQL to Java. Here every mapper is an **interface with annotations**; MyBatis generates the
implementation at startup.

```java
@Mapper
public interface OrderMapper {
    @Select("SELECT COUNT(*) > 0 FROM trading.orders WHERE idempotency_key = #{idempotencyKey}")
    boolean existsByIdempotencyKey(@Param("idempotencyKey") String idempotencyKey);
}
```

- `#{name}` is a **bind parameter** (a JDBC `?`), which is what makes it safe from SQL injection. (`${name}` would
  paste text into the SQL, and this codebase never uses it.)
- `@Results` / `@Result` map columns to properties.
- `@ConstructorArgs` / `@Arg` build immutable domain objects through their constructors.
- `@Arg(..., select = "…AccountMapper.findAccountById")` is a **nested select**: for each row, MyBatis runs
  *another* query to load the related object (order → account → user, order → instrument). It's convenient but
  costs extra queries per row (the "N+1" pattern).
- `@Options(useGeneratedKeys = true, keyProperty = ...)` reads back DB-generated keys.

### 1.7 Spring Kafka

- **Producing:** `KafkaTemplate.send(topic, key, value)`. The value is serialised with `JsonSerializer`
  (configured in `application.properties`). The key decides the partition, so messages with the same key stay in
  order.
- **Consuming:** a method annotated `@KafkaListener(topics = ..., groupId = ...)` receives each message (here as
  a raw JSON `String`, parsed with Jackson's `ObjectMapper`). Each **group id** keeps its own read position
  (offset).

### 1.8 Configuration

`application.properties` uses placeholders like `${DB_URL}` (required environment variable) and
`${KAFKA_CONSUMER_GROUP:trade-api-group}` (environment variable with a default). `@Value("${jwt.secret}")`
injects one into a constructor.

### 1.9 Maven

`pom.xml` declares dependencies and plugins. `mvnw` / `mvnw.cmd` is the **Maven Wrapper**, which downloads the
right Maven version so you don't need it installed. `spring-boot-starter-parent 3.5.4` pins compatible versions
of everything; Java is **21**.

---

## Part 2: Folder and file map

```
order-service/
├── pom.xml                          dependencies: web, validation, MyBatis, PostgreSQL, jjwt, spring-kafka,
│                                    springdoc, domain-engine (local library), Sonar plugin
├── mvnw, mvnw.cmd, .mvn/            Maven Wrapper
├── .gitignore, .gitattributes
├── manifest.env                     empty
├── KAFKA_ORDERS_CONSUMER_GUIDE.md   the ORDER_PLACED message format, for whoever consumes "orders"
├── target/                          build output (gitignored)
└── src/
    ├── main/resources/application.properties    all configuration (DB, JWT, Kafka, error output, Swagger)
    ├── main/java/com/tradingsystem/spring_boot_app/
    │   ├── SpringBootAppApplication.java   entry point (@SpringBootApplication @EnableKafka)
    │   ├── config/
    │   │   ├── SecurityConfig.java         registers CorsFilter (order 0) + JwtAuthenticationFilter (order 1)
    │   │   └── OpenApiConfig.java          Swagger metadata + global bearer scheme
    │   ├── security/
    │   │   ├── JwtAuthenticationFilter.java   verifies Bearer JWT on /api/v1/**, sets request attr accountId
    │   │   └── JwtTokenProvider.java          jjwt parsing: user tokens (accountId) + internal service tokens
    │   ├── controller/
    │   │   ├── AccountController.java       /api/v1/accounts/... (account, balance, positions, orders)
    │   │   ├── OrderController.java         POST /api/v1/orders, DELETE /api/v1/orders/{id}
    │   │   ├── WatchlistController.java     /api/v1/watchlists/...
    │   │   ├── InstrumentController.java    GET /api/v1/instruments?search=
    │   │   └── InternalAccountController.java  /internal/accounts/... (auth-service only)
    │   ├── service/
    │   │   ├── AuthService.java            reads the token's accountId from the request
    │   │   ├── AccountService.java         account/balance/positions/order-history read models, balance update
    │   │   ├── OrderService.java           place (validate → insert → publish after commit) and cancel
    │   │   ├── WatchlistService.java       watchlists, default list seeding, instrument search, live prices
    │   │   ├── InternalAccountService.java create / find / activate trading accounts
    │   │   └── LatestPriceCache.java       ConcurrentHashMap<symbol, latest quote>
    │   ├── mapper/                         MyBatis SQL interfaces
    │   │   ├── AccountMapper.java  OrderMapper.java  PositionMapper.java  InstrumentMapper.java
    │   │   ├── WatchlistMapper.java  UserMapper.java  HoldingMapper.java  SettlementMapper.java
    │   ├── kafka/
    │   │   ├── KafkaMessageEnvelope.java   the 6-field envelope shared by every topic
    │   │   ├── OrderPlacedPayload.java     body of ORDER_PLACED (produced here)
    │   │   ├── QuotePayload.java           body of QUOTE (consumed here)
    │   │   ├── TradeEventPayload.java      body of ORDER_FILLED/REJECTED (contract only; not consumed)
    │   │   ├── MarketDataConsumer.java     market-data → LatestPriceCache
    │   │   └── UserRegisteredEventConsumer.java   user-registrations → create trading account
    │   ├── dto/                            request/response records (+ dto/internal/ for /internal)
    │   └── exception/
    │       ├── ApiExceptionHandler.java    exception → { errorCode, message } + HTTP status
    │       ├── UnauthorisedException.java  OrderNotFoundException.java  DefaultWatchlistProtectedException.java
    └── test/java/...                       105 tests in 18 files (controllers, services, security, kafka,
                                            exception handler, CORS, characterisation tests)

shared-libs/domain-engine/                  plain-Java business library (see Part 7)
```

**Layering:** controller → service → mapper → PostgreSQL, with domain-engine objects (entities and the
validator) flowing through the service layer.

---

## Part 3: Build, configuration and environment variables

### [pom.xml](../Services/order-service/pom.xml)

| Dependency | Why |
|---|---|
| `spring-boot-starter-web` | embedded Tomcat, Spring MVC, Jackson |
| `spring-boot-starter-validation` | Jakarta Bean Validation (`@Valid`, `@NotBlank`…) |
| `mybatis-spring-boot-starter 3.0.5` | MyBatis mappers |
| `postgresql` (runtime) | JDBC driver |
| `jjwt-api/impl/jackson 0.12.5` | parse and verify JWTs |
| `spring-kafka` | producer + consumers |
| `springdoc-openapi-starter-webmvc-ui 2.8.17` | OpenAPI JSON + Swagger UI generated from the controllers |
| `com.tradingsystem:domain-engine:1` | the shared business library (**must be `mvn install`ed locally first**) |
| test: `spring-boot-starter-test`, `mybatis-spring-boot-starter-test` | JUnit 5, Mockito, MockMvc |

### [application.properties](../Services/order-service/src/main/resources/application.properties)

| Property | Value / env var | Meaning |
|---|---|---|
| `spring.datasource.url/username/password` | `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}` | **required**; PostgreSQL connection |
| `jwt.secret` | `${JWT_SECRET:your-256-bit-secret…}` | HMAC key; **must equal the auth service's `JWT_SECRET`** |
| `spring.jackson.deserialization.fail-on-unknown-properties` | `true` | unknown JSON fields → 422 |
| `spring.mvc.throw-exception-if-no-handler-found`, `spring.web.resources.add-mappings=false` | | unknown routes become `NoHandlerFoundException` → `API-404` JSON |
| `server.error.include-*` = never, whitelabel off | | never leak stack traces or messages |
| `spring.kafka.bootstrap-servers` | `${KAFKA_BOOTSTRAP_SERVERS:10.8.76.9:9092}` | brokers (note the hard-coded IP default) |
| producer `acks=all`, `enable.idempotence=true`, `retries=10`, `max.in.flight=5`, `JsonSerializer` | | durable, de-duplicated sends |
| `spring.kafka.consumer.group-id` | `${KAFKA_CONSUMER_GROUP:trade-api-group}` | default group (listeners override it) |
| consumer `auto-offset-reset=earliest`, `enable-auto-commit=false`, String deserialisers | | |
| `spring.kafka.listener.ack-mode` | `manual` | offsets committed only when code acknowledges (see Part 14) |
| `app.kafka.topics.market-data` / `app.kafka.groups.watchlist-service` | `market-data` / `watchlist-service` | |
| `app.kafka.topics.user-registrations` / `app.kafka.groups.account-provisioning` | `user-registrations` / `account-provisioning` | |
| `springdoc.api-docs.path` / `swagger-ui.path` / `paths-to-match` | `/api-docs`, `/swagger-ui`, `/api/v1/**` | `/internal/**` is kept out of the docs |
| `ui.origin` (read in `SecurityConfig`) | default `http://localhost:4200` | CORS allowed origin |

The server port isn't set, so it's Spring's default, **8080**. That's the frontend's `TRADE_API_BASE_URL`.

### Other files

- [KAFKA_ORDERS_CONSUMER_GUIDE.md](../Services/order-service/KAFKA_ORDERS_CONSUMER_GUIDE.md): the
  `ORDER_PLACED` envelope and payload, keyed by `accountId`, 7-day retention. Written for the executor team.
- The platform-wide Kafka contract is [Contracts/Event-Schemas/kafka-topics.md](../Contracts/Event-Schemas/kafka-topics.md),
  and topics are created by [Infrastructure/Kafka/scripts/create-topics.sh](../Infrastructure/Kafka/scripts/create-topics.sh)
  (`orders` 3 partitions/7d, `trade-events` 3/30d, `market-data` 6/1d, `user-registrations` 3/7d, plus a
  `.DLT` topic for each). Broker auto-creation is deliberately off.
- There is **no Dockerfile** for this service (the executor has one).

---

## Part 4: How the service boots

1. `SpringApplication.run(...)` starts the context.
2. **Auto-configuration**: a Hikari connection pool to PostgreSQL, MyBatis (scans `@Mapper` interfaces), Jackson,
   Tomcat on 8080, a `KafkaTemplate`, and Kafka listener containers.
3. **Beans**: `JwtTokenProvider` is created with `jwt.secret`. It **refuses to start if the secret is shorter
   than 32 characters** (HS256 needs ≥ 256 bits). `SecurityConfig` registers the CORS filter (order 0) and the JWT
   filter (order 1) for `/api/v1/*`.
4. `@KafkaListener` containers start: `UserRegisteredEventConsumer` (group `account-provisioning`) and
   `MarketDataConsumer` (group `watchlist-service`).
5. Swagger UI is at `http://localhost:8080/swagger-ui` and OpenAPI JSON at `/api-docs`.

**Prerequisites:** PostgreSQL with migrations applied and `search_path = auth, trading, public` (set by
`Databases/PostgreSQL/apply.sh`; several queries use unqualified table names like `orders`), Kafka with topics
created, and `domain-engine` installed in your local Maven repo.

---

## Part 5: Every endpoint at a glance

All `/api/v1/**` routes need `Authorization: Bearer <access JWT>` from the auth service. The account is **always
the token's `accountId`**: the `{id}` in `/accounts/{id}/...` is validated (`@Min(1)`) and then **ignored**.

| Method + path | Request | Success | Handler → service |
|---|---|---|---|
| `GET /api/v1/accounts/me` (also `/{id}`) | none | 200 `AccountResponse` | `AccountController` → `AccountService.getAccount` |
| `GET /api/v1/accounts/me/balance` (also `/{id}/balance`) | none | 200 `BalanceResponse` | `getBalance` |
| `PATCH /api/v1/accounts/me/balance` (also `/balance`) | `{ cashBalance }` | 200 `BalanceResponse` | `updateBalance` (optimistic lock) |
| `GET /api/v1/accounts/me/positions` (also `/{id}/positions`) | none | 200 `PositionResponse[]` | `getPositions` (+ live price) |
| `GET /api/v1/accounts/me/orders?status=&from=&to=` (also `/{id}/orders`) | none | 200 `OrderHistoryEntry[]` | `getOrders` |
| `POST /api/v1/orders` | `PlaceOrderRequest` | **200** `OrderResponse` (status `NEW`) | `OrderController` → `OrderService.placeOrder` |
| `DELETE /api/v1/orders/{id}` (`5001` or `ORD-5001`) | none | 200 `OrderResponse` (`CANCELLED`) | `OrderService.cancelOrder` |
| `GET /api/v1/instruments?search=` | none | 200 `InstrumentResponse[]` | `InstrumentController` → `WatchlistService.searchInstruments` |
| `GET /api/v1/watchlists` | none | 200 `WatchlistResponse[]` | `WatchlistController` → `getWatchlists` |
| `POST /api/v1/watchlists` | `{ name }` | 201 `WatchlistResponse` | `createWatchlist` |
| `GET /api/v1/watchlists/{watchlistId}` | none | 200 `WatchlistDetailResponse` | `getWatchlist` |
| `DELETE /api/v1/watchlists/{watchlistId}` | none | 204 | `deleteWatchlist` |
| `POST /api/v1/watchlists/{watchlistId}/instruments` | `{ symbol }` | 201 `WatchlistStockResponse` | `addInstrument` |
| `DELETE /api/v1/watchlists/{watchlistId}/instruments/{symbol}` | none | 204 | `removeInstrument` |
| `POST /internal/accounts` | `{ userId }` | 201 `InternalAccountResponse` | `InternalAccountController` → `createAccountForUser` |
| `GET /internal/accounts/by-user/{userId}` | none | 200 / 404 | `findAccountByUserId` |
| `PATCH /internal/accounts/by-user/{userId}/activate` | none | 200 | `activateAccountForUser` |
| `GET /swagger-ui`, `GET /api-docs` | none | docs | springdoc |

`/internal/**` isn't covered by the JWT filter. Instead, `InternalAccountController` itself requires an
**internal service token** (a JWT with claim `service: "auth-service"`). Customer tokens are refused there.

---

## Part 6: The code, file by file

### 6.1 Configuration: [config/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/config/)

**`SecurityConfig`** registers two filters:
- **`CorsFilter`, order 0**, for `/api/v1/**`: it allows origin `ui.origin`, methods GET/POST/PATCH/DELETE/OPTIONS
  and headers `Authorization` and `Content-Type`. It runs **first** so the browser's CORS **preflight**
  (`OPTIONS`, which never carries a token) is answered here instead of being rejected with 401.
- **`JwtAuthenticationFilter`, order 1**, on `/api/v1/*` and `/api/v1/**`.

**`OpenApiConfig`** sets the Swagger title/description and declares a global HTTP bearer scheme so Swagger UI
shows an "Authorize" button.

### 6.2 Security: [security/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/security/)

**`JwtAuthenticationFilter`** (`OncePerRequestFilter`), for paths starting `/api/v1/`:
1. Requires an `Authorization` header starting with `Bearer ` and a non-blank token.
2. `tokenProvider.extractAccountId(token)` → `null` on any failure.
3. Success → `request.setAttribute("accountId", accountId)` → continue the chain.
4. Any failure → writes `401 {"errorCode":"AUTH-401","message":"Unauthorised"}` itself (filters run outside the
   `@RestControllerAdvice`).

**`JwtTokenProvider`**:
- The constructor turns `jwt.secret` into an HMAC-SHA key (`Keys.hmacShaKeyFor`) and fails if it's shorter than 32 chars.
- `extractAccountId(token)`: `Jwts.parser().verifyWith(key).build().parseSignedClaims(token)` verifies the
  **signature** and **expiry**; it then double-checks expiry and that `alg` is `HS256`, and reads the
  `accountId` claim (Integer or Long). Any exception → `null`. It does **not** check `iss` or `roles`.
- `validateInternalServiceToken(token)`: the same signature/expiry/alg checks, plus claim `service ==
  "auth-service"`. Customer tokens have no `service` claim, so they fail. Internal tokens have no `accountId`, so
  they fail the public filter.

### 6.3 Controllers: [controller/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/controller/)

They're thin: get the account id via `authService.authenticatedAccountId(request)`, call one service method,
wrap the result in `ResponseEntity`.

- **`AccountController`**: `/me`, `/me/balance`, `/me/positions`, `/me/orders`, plus `/{id}` aliases (path id
  ignored) and `PATCH /balance` + `/me/balance`. Query `status` binds to the domain `OrderStatus` enum; `from`/`to`
  bind as ISO `OffsetDateTime`.
- **`OrderController`**:
  - `placeOrder` builds a **new** `PlaceOrderRequest` with `accountId` replaced by the token's account, so a body
    claiming someone else's account is ignored.
  - `cancelOrder` normalises the id (strips `ORD-`, accepts a number or UUID) and calls `orders.cancelOrder`. It
    only checks that a bearer header is present (see Part 14).
- **`WatchlistController`**: CRUD on watchlists and their instruments; returns 201/204 as appropriate.
- **`InstrumentController`**: authenticates, then returns `searchInstruments(search ?? "")`. A blank search
  returns the whole active catalog.
- **`InternalAccountController`**: `validateAndExtractToken` (Bearer header → `validateInternalServiceToken`,
  else `UnauthorisedException`) then create / get-by-user / activate. It also contains leftover
  `System.out.println` debug lines, including one that prints the Authorization header.

### 6.4 Services: [service/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/service/)

**`AuthService`**
- `requireBearerToken(request)`: the header is present, starts with `Bearer ` and isn't blank, else `UnauthorisedException`.
- `authenticatedAccountId(request)`: the above, plus reads the `accountId` attribute the filter set.
- `verifyAccountAccess(request, id)`: compares token vs requested account and throws ACC-403 on mismatch. **No
  controller calls it**, so the `/{id}` routes never return ACC-403 (see Part 14, item 16).

**`AccountService`**
- `getAccount(id)` → `AccountResponse(id, accountReference, holderName, cashBalance, status, version, now)`.
  The holder name comes from `auth.users` first/last name.
- `getBalance(id)` → `BalanceResponse(id, cashBalance, "USD", now)`.
- `updateBalance(id, newBalance)` → `updateAvailableBalanceOptimistic(id, balance, loadedVersion)`; 0 rows →
  `OptimisticLockException` (409). It **sets** the balance to the value given.
- `getPositions(id)` → open positions with `quantity > 0`, each enriched with `currentPrice` from
  `LatestPriceCache` and `marketValue = price × qty` (both `null` if no quote has arrived yet).
- `getOrders(id, status, from, to)` → `OrderMapper.findOrderHistoryByAccountId` (a JOIN with `instruments`,
  `filled_price` as `executedPrice`, id formatted `ORD-<n>`), filtered by status, newest first. **`from`/`to` are
  accepted but not applied.**

**`OrderService`**: see [Flow 3](#flow-3-place-an-order).
- `placeOrder(request)` (`@Transactional`): load the account and instrument → build a domain `Order` (`LIMIT`,
  `DELIVERY`, id from `nextOrderId()`) → `OrderValidator.validate` with DB-backed adapters → `insertOrder` (status
  `NEW`) → register **afterCommit** `kafkaTemplate.send("orders", accountId, envelope)` → return `NEW`.
- `cancelOrder(id)` (`@Transactional`): `UPDATE … SET status='CANCELLED' WHERE order_id=? AND status='NEW'`; 0 rows
  → `IllegalStateException` → 409 "Order is not cancellable".
- The private inner classes `DatabaseIdempotencyStore`, `DatabasePositionRepository` and
  `DatabaseHoldingRepository` **adapt MyBatis mappers to the domain-engine repository interfaces**. This is the
  **ports and adapters** idea: the domain defines interfaces; the app plugs in implementations.

**`WatchlistService`**: see [Flow 7](#flow-7-watchlists-and-instrument-search).
- `userIdForAccount(accountId)` maps a trading account to the owning auth user UUID (watchlists belong to the
  user, not the account).
- `ensureDefaultWatchlist(userId)`: if there's no default list, it adopts one named "Default" or creates one, then
  seeds `AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, NFLX` (if those instruments exist). It swallows duplicate-key
  races and FK problems.
- `getWatchlists`, `createWatchlist` (name trimmed, ≤ 60; unique per user, enforced by a DB index → 409),
  `getWatchlist` (detail with prices), `deleteWatchlist` (the default is protected → 409), `addInstrument`
  (unknown symbol → `INS-404`; duplicates ignored via `ON CONFLICT DO NOTHING`), `removeInstrument`.
- `searchInstruments(query)`: all `ACTIVE` instruments whose symbol or display name contains the query
  (case-insensitive), with prices.
- `ownedWatchlist(accountId, watchlistId)`: loads the list and checks it belongs to the caller; another user's
  list → `ACC-403` (missing → `WL-404`).
- `toStock(symbol, name)`: price, change and changePercent from `LatestPriceCache`; if there's no live quote, it
  falls back to the reference price in `trading.instruments.price` with change 0.

**`InternalAccountService`**
- `createAccountForUser(userId)` (`@Transactional`) inserts `trading.trading_accounts` (`ACC-<millis>`, balance 0,
  status **`PENDING`**) and ensures the default watchlist.
- `createAccountForUserIfMissing(userId)` is **idempotent**: it returns the existing account if one exists. The
  Kafka consumer uses this, so a redelivered event can't create a second account.
- `activateAccountForUser(userId)`: ACTIVE → returned as-is; PENDING → `UPDATE … SET account_status='ACTIVE'
  WHERE user_id=? AND account_status='PENDING'`; anything else → `IllegalStateException`.
- `findAccountByUserId(userId)` → `Optional<InternalAccountResponse>`.

**`LatestPriceCache`** is a `ConcurrentHashMap<String, QuotePayload>` keyed by uppercase symbol: `update`, `get`,
`snapshot`, `size`. It's thread-safe because the Kafka listener thread writes while HTTP threads read. It keeps
**only the newest quote per symbol, in memory only**, so it's empty after a restart until quotes arrive.

### 6.5 Mappers: [mapper/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/mapper/)

| Mapper | Tables | Notable queries |
|---|---|---|
| `AccountMapper` | `trading.trading_accounts` | `insertAccount` (`RETURNING trading_account_id`), `findAccountById` (nested user lookup), `findAccountByUserId`, `updateAvailableBalanceOptimistic` (`… WHERE id=? AND version=?`, `version = version + 1`), `activatePendingAccountByUserId`, `findUserIdByAccountId` |
| `OrderMapper` | `orders` (+ `instruments`) | `nextOrderId` = `MAX(order_id)+1`, `insertOrder` (status `NEW`), `existsByIdempotencyKey`, `findOrderHistoryByAccountId` (JOIN, `'ORD-' \|\| id`, `filled_price`), `updateOrderStatusIfCurrent` (compare-and-set for cancel) |
| `PositionMapper` | `trading.positions` | `findPositionsByAccountId` (open, qty > 0), `nextPositionId`, insert/update/close |
| `InstrumentMapper` | `trading.instruments` | `findInstrumentBySymbol`, `findInstrumentsByStatus('ACTIVE')` |
| `WatchlistMapper` | `trading.watchlist`, `trading.watchlist_inst` | per-user lists, default list, members (JOIN instruments), `insertWatchlistInstrument … ON CONFLICT DO NOTHING`, `findReferencePriceBySymbol`, `findAllDistinctWatchlistSymbols` |
| `UserMapper` | **`auth.users`** (read), `trading.users` | `findUserById` reads the auth service's table and maps any status other than BLOCKED/DEACTIVATED to `ACTIVE` |
| `HoldingMapper` | `trading.holdings` | used by the validator's SELL check (`findHoldingByAccountAndInstrument`) |
| `SettlementMapper` | `trading.settlements` | not used by any service |

### 6.6 Kafka: [kafka/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/kafka/)

**`KafkaMessageEnvelope<T>`**: every message on every topic has the same outer shape:

```json
{ "eventId": "<uuid>", "eventType": "ORDER_PLACED", "eventTime": "<ISO instant>",
  "source": "trade-api", "schemaVersion": 1, "payload": { ... } }
```

It's annotated `@JsonIgnoreProperties(ignoreUnknown = true)` for **forward compatibility** (new fields don't break
old consumers). It also holds enums of known sources and event types.

| Class | Direction | Topic / key |
|---|---|---|
| `OrderPlacedPayload` | **produced** by `OrderService` | `orders`, key = `accountId` |
| `UserRegisteredEventConsumer` | **consumed**, group `account-provisioning` | `user-registrations` |
| `MarketDataConsumer` + `QuotePayload` | **consumed**, group `watchlist-service` | `market-data`, key = symbol |
| `TradeEventPayload` | contract model only; **this service doesn't consume `trade-events`** | `trade-events` |

**`UserRegisteredEventConsumer`**: parse the JSON → require `eventType == USER_REGISTERED` and a `payload.userId`
→ `createAccountForUserIfMissing(userId)`. On failure it logs and rethrows, and Spring's default error handler
retries.

**`MarketDataConsumer`**: parse → accept a wrapped (`payload`) or bare quote → require symbol, price, bid and ask →
`cache.update(quote)`. Malformed messages are logged and ignored or rethrown.

### 6.7 DTOs and exceptions

- [dto/](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/dto/) holds records for every
  request/response (`AccountResponse`, `BalanceResponse`, `PositionResponse`, `OrderResponse`,
  `OrderHistoryEntry`, `OrderHistoryRow` (internal DB projection), `Watchlist*Response`, `InstrumentResponse`,
  `UpdateBalanceRequest` (≥ 0.00, 2 decimals), `CreateWatchlistRequest` (1–60 chars),
  `AddWatchlistInstrumentRequest` (≤ 20 chars), `ErrorResponse`, `AccountStatus` enum) and `dto/internal/` for the
  internal API. The order **request** DTO is `PlaceOrderRequest` from **domain-engine**.
- [exception/ApiExceptionHandler.java](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/exception/ApiExceptionHandler.java)
  maps exceptions to HTTP; see [Part 11](#part-11-error-codes).

---

## Part 7: The domain-engine library

[shared-libs/domain-engine/](../Services/shared-libs/domain-engine/) is a **plain Java 21 library** (no Spring)
shared by the order-service and the executor. Its `pom.xml` uses the **Maven Enforcer plugin to ban Spring,
servlet APIs, JDBC drivers, MyBatis and connection pools**, which guarantees the business rules stay
framework-free and unit-testable. It has 148 tests in 17 files.

| Package | Contents |
|---|---|
| `domain.dto` | `PlaceOrderRequest`: the order request (validated **in its constructor**: account ≥ 1, symbol 1–20, side, qty ≥ 1, price ≥ 0.01 with ≤ 2 decimals, idempotency key 8–100 chars) |
| `domain.entities` | `Account` (`credit`, `debit`, `canAfford`; amounts ≥ 0 with ≤ 2 decimals), `Order` (immutable fields + a **state machine** `transitionTo`), `Position` / `Holding` (`buy` recalculates the weighted average cost, `sell` reduces qty), `Instrument` (`mayBeTraded`, `delist`), `User`, `Settlement` |
| `domain.enums` | `OrderSide` BUY/SELL · `OrderType` MARKET/LIMIT/STOP_LOSS/STOP_LIMIT · `OrderStatus` NEW/OPEN/PARTIALLY_FILLED/FILLED/CANCELLED/REJECTED/EXPIRED · `ProductType` INTRADAY/DELIVERY · `TradingStatus` PENDING/ACTIVE/SUSPENDED/BLOCKED/CLOSED · `UserStatus` · `AssetClass` |
| `domain.repositories` | **interfaces** (`PositionRepository`, `HoldingRepository`, `SettlementRepository`, `IdempotencyStore`) + in-memory implementations used in tests |
| `domain.services` | `OrderValidator` (used in production), `OrderExecutor`, `PositionUpdater`, `SettlementProcessor`, `HoldingUpdater`, `MarketPriceProvider` (from earlier sprints; the real execution now lives in the executor service) |
| `exception` | `DomainException(code, message)` and subclasses, each carrying its error code (see Part 11) |

**`OrderValidator.validate(order)`** runs, in order:
1. `validateUser`: the holder's `UserStatus` must be ACTIVE, else `UserNotActiveException` (USR-403).
2. `validateAccount`: the account's `TradingStatus` must be ACTIVE, else `AccountNotActiveException` (ACC-403).
   **This is the backend's KYC gate**: accounts stay PENDING until an admin approves KYC.
3. `validateInstrument`: `mayBeTraded()`, else `InstrumentDelistedException`.
4. `validateFunds` (BUY only): `limitPrice × quantity ≤ cashBalance`, else `InsufficientFundsException` (ORD-400).
5. `validateIdempotencyOrder`: the key must not exist already, else `DuplicateOrderException` (ORD-409).
6. `validateSellAvailability` (SELL only): DELIVERY needs a holding with enough quantity; INTRADAY needs a
   position; else `InsufficientHoldingsException` (ORD-409).

**Order state machine (`Order.transitionTo`):** `NEW → OPEN | FILLED | REJECTED | CANCELLED`;
`OPEN → PARTIALLY_FILLED | FILLED | CANCELLED | EXPIRED`; `PARTIALLY_FILLED → FILLED | CANCELLED`. Terminal states
can't change.

**Weighted average cost** (`Position.buy`): `newAvg = (oldAvg × oldQty + price × boughtQty) / (oldQty +
boughtQty)`, rounded HALF_UP to 2 dp. `sell` keeps the average and only reduces the quantity.

---

## Part 8: The database tables

PostgreSQL schema `trading` (migrations in [Databases/PostgreSQL/migrations/](../Databases/PostgreSQL/migrations/)).

| Table | Written by | Read by | Key columns |
|---|---|---|---|
| `trading_accounts` | order-service (create/activate/balance), executor (cash on fill) | both | `trading_account_id`, `account_number`, `user_id` (UUID string, auth user), `available_balance`, `blocked_balance` (unused), `account_status`, **`version`** (optimistic lock) |
| `orders` | order-service (insert NEW, cancel), executor (FILLED/REJECTED, `filled_price`, `filled_at`) | both | `order_id`, `trading_account_id`, `instrument_id`, `order_type`, `side`, `product_type`, `quantity`, `limit_price`, `status`, `idempotency_key` (unique), `created_at` |
| `positions` | executor | order-service (positions), executor | `position_id`, account, instrument, `product_type`, `quantity`, `average_price`, `position_status` |
| `holdings` | executor (DELIVERY) | order-service (SELL validation), executor | `holding_id`, `demat_account_id`, instrument, `quantity`, `average_price` |
| `instruments` | seed data | both | `instrument_id`, `symbol`, `display_name`, `asset_class`, `status`, `price` (reference price) |
| `watchlist`, `watchlist_inst` | order-service | order-service, executor poller | `is_default` + unique `(user_id, lower(name))` + one default per user (migration 015a) |
| `auth.users` | auth-service | order-service (`UserMapper`), executor | holder names and status |

The `search_path` is `auth, trading, public`, so unqualified names like `orders` resolve to `trading.orders`.

---

## Part 9: Flows end to end

### Flow 1: A trading account is created (registration)

1. The auth service registers a user and publishes `USER_REGISTERED { userId, username }` to `user-registrations`
   (key = userId).
2. [UserRegisteredEventConsumer](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/kafka/UserRegisteredEventConsumer.java)
   (group `account-provisioning`) parses it and checks the type and userId.
3. `InternalAccountService.createAccountForUserIfMissing(userId)`:
   1. `AccountMapper.findAccountByUserId`: already there? Return it (idempotent).
   2. Otherwise `insertAccount("ACC-<millis>", userId, "PENDING")` → balance 0, version 0.
   3. `WatchlistService.ensureDefaultWatchlist(userId)` → a "Default" list seeded with 8 symbols.
4. Now the user can log in. The auth service's `GET /internal/accounts/by-user/{userId}` finds the account, so
   the JWT gets its `accountId`.

### Flow 2: Login lookup and KYC activation (internal API)

1. **Login/refresh:** auth service → `GET /internal/accounts/by-user/{userId}` with an internal token.
   `InternalAccountController.validateAndExtractToken` → `JwtTokenProvider.validateInternalServiceToken` (signature,
   expiry, HS256, `service == "auth-service"`) → `findAccountByUserId` → 200 `{ accountId, accountNumber,
   availableBalance, accountStatus }` or 404. The auth service blocks login only if the status is `SUSPENDED`.
2. **KYC approved:** auth service → `PATCH /internal/accounts/by-user/{userId}/activate` → `activateAccountForUser`:
   PENDING → ACTIVE. From now on `OrderValidator.validateAccount` passes and the user can trade.

### Flow 3: Place an order

**Scenario:** the customer buys 10 AAPL at a 224.12 limit. The UI sends `POST /api/v1/orders`.

1. **CorsFilter** checks the origin. **JwtAuthenticationFilter** verifies the JWT and sets `accountId = 6`.
2. Jackson builds a domain `PlaceOrderRequest`. **Its constructor validates** (qty ≥ 1, price ≥ 0.01 with ≤ 2 dp,
   key 8–100 chars…); a failure → `InvalidOrderArgumentException` → **422 `VAL-422`**. Unknown JSON fields →
   422 too (`fail-on-unknown-properties`).
3. [OrderController.placeOrder](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/controller/OrderController.java)
   rebuilds the request with **`accountId` from the token**.
4. [OrderService.placeOrder](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/service/OrderService.java)
   (one DB transaction):
   1. `accounts.findAccountById(6)` (with nested holder from `auth.users`) or **404 `ACC-404`**.
   2. `instruments.findInstrumentBySymbol("AAPL")` or **404 `INS-404`**.
   3. `new Order(nextOrderId(), account, instrument, LIMIT, BUY, DELIVERY, 10, 224.12, null, key)`.
   4. `OrderValidator.validate(order)` with the DB-backed adapters:
      - account not ACTIVE (KYC not approved, or suspended) → **403 `ACC-403`**
      - BUY and `224.12 × 10 > cash` → **400 `ORD-400`**
      - idempotency key already in `orders` → **409 `ORD-409`**
      - SELL without enough holdings → **409 `ORD-409`**
   5. `orders.insertOrder(order)` → row with status **`NEW`**.
   6. Build the envelope `ORDER_PLACED { orderId, accountId, symbol, side, quantity, price, idempotencyKey,
      createdOn }` and register an **afterCommit** callback.
5. The transaction commits, then `kafkaTemplate.send("orders", "6", envelope)`. Keying by account keeps one
   account's orders in order on one partition. If the transaction rolls back, **no event is sent**.
6. Response **200** `{ orderId: "ORD-5001", status: "NEW", message: "Order accepted, pending execution", ... }`.
7. The trade-executor consumes the event and fills or rejects it (see the executor guide). The UI's order blotter
   polls `GET /accounts/me/orders` every 5 s while anything is `NEW`.

**Why cash isn't deducted here:** placement only checks **affordability**. The money moves when the executor
fills the order, and the executor re-checks funds at that moment. Funds aren't reserved (`blocked_balance` is
unused), so two quick buys can each pass placement; the executor then rejects the one that no longer fits.

### Flow 4: Dashboard reads

The UI calls three endpoints in parallel:
- `GET /accounts/me` → `AccountService.getAccount`: account + holder name + status.
- `GET /accounts/me/balance` → cash, `"USD"`, `asOf = now`.
- `GET /accounts/me/positions` → open positions; for each, `LatestPriceCache.get(symbol)` → `currentPrice`,
  `marketValue`. No quote yet → both `null`, and the UI falls back to average cost.

### Flow 5: Order history and cancel

- `GET /accounts/me/orders?status=FILLED` → one SQL JOIN over `orders` + `instruments` (with `filled_price`
  written by the executor) → filtered in Java by status → newest first.
- `DELETE /api/v1/orders/ORD-5001` → `normaliseOrderId` → `5001` → `updateOrderStatusIfCurrent(5001, NEW,
  CANCELLED)`. A compare-and-set means a cancel can't overwrite a fill that already happened; 0 rows → **409**.

### Flow 6: Deposit or withdraw (balance update)

The UI computes the new total and sends `PATCH /accounts/me/balance { cashBalance: 1500.00 }`.
`UpdateBalanceRequest` validation (≥ 0, 2 dp) → `AccountService.updateBalance` →
`UPDATE … SET available_balance = 1500.00, version = version + 1 WHERE id = 6 AND version = <loaded>`. If someone
else changed the row in between, 0 rows → `OptimisticLockException` → **409 `ORD-409`**.

### Flow 7: Watchlists and instrument search

1. `GET /api/v1/watchlists` → `userIdForAccount(6)` → `ensureDefaultWatchlist(userId)` → all lists (default
   first) with their symbols.
2. `GET /api/v1/instruments?search=` (blank) → every ACTIVE instrument with its live or reference price. The UI
   caches it for typeahead.
3. `POST /api/v1/watchlists { name: "Tech" }` → trimmed, ≤ 60 → `nextWatchlistId()` + insert. A duplicate name
   violates the unique index → `DuplicateKeyException` → **409 `WL-409`**.
4. `POST /watchlists/{id}/instruments { symbol: "nvda" }` → `ownedWatchlist` (wrong owner → ACC-403) → uppercase →
   instrument lookup (unknown → INS-404) → insert (duplicates ignored) → 201 with price.
5. `GET /watchlists/{id}` → members with `toStock` prices (cache, else reference price).
6. `DELETE /watchlists/{id}` → the default is protected (**409 `WL-409`**) → delete members, then the list → 204.

### Flow 8: Live prices arriving

1. The executor's poller publishes `QUOTE` envelopes to `market-data` (key = symbol).
2. [MarketDataConsumer](../Services/order-service/src/main/java/com/tradingsystem/spring_boot_app/kafka/MarketDataConsumer.java)
   (group `watchlist-service`) → `QuotePayload` → `LatestPriceCache.update`.
3. The next positions/watchlist/instrument response includes that price. The UI never talks to Kafka.

### Flow 9: Unauthenticated or forged request

- No header, wrong scheme, bad signature, expired, wrong algorithm, or no `accountId` claim → filter → **401
  `AUTH-401`**, and the controller never runs.
- An admin token (accountId 0) passes the filter but finds no account → 404 `ACC-404`.

---

## Part 10: Security design

| Concern | How it's handled |
|---|---|
| Authentication | `JwtAuthenticationFilter` verifies HS256 signature + expiry with the shared `JWT_SECRET` |
| Algorithm confusion | algorithm pinned to HS256; signed tokens only (`parseSignedClaims`) |
| Weak keys | startup fails if the secret is shorter than 32 chars |
| Horizontal access (other accounts) | account always taken from the token; `/accounts/{id}` ignores `{id}`; order placement overwrites `accountId`; watchlists checked for ownership |
| Internal endpoints | separate service token with `service = "auth-service"`; customer tokens refused; not in Swagger docs |
| SQL injection | MyBatis `#{}` bind parameters only |
| Unknown/extra input | Bean Validation + `fail-on-unknown-properties=true` → 422 |
| Information leakage | `server.error.include-*=never`, uniform `{ errorCode, message }` bodies, catch-all → `ERR-500` |
| CORS | only `ui.origin`; preflight handled before auth |
| Duplicate orders | idempotency key check + unique column |
| Lost updates on balance | optimistic locking with `version` |
| Event/DB consistency | Kafka send registered **after commit** |

---

## Part 11: Error codes

Every error body is `{ "errorCode": "...", "message": "..." }` (from `ApiExceptionHandler`, or from the filter
for 401).

| HTTP | Code | Exception(s) | Typical cause |
|---|---|---|---|
| 401 | `AUTH-401` | `UnauthorisedException`, filter | missing/invalid/expired token |
| 403 | `ACC-403` | `AccountNotActiveException` | account PENDING/SUSPENDED; watchlist owned by someone else |
| 404 | `ACC-404` | `AccountNotFoundException` | no trading account for the token |
| 404 | `INS-404` | `InstrumentNotFoundException`, `InstrumentDelistedException` | unknown or delisted symbol |
| 400 | `ORD-400` | `InsufficientFundsException` | buy costs more than cash |
| 409 | `ORD-409` | `InsufficientHoldingsException`, `DuplicateOrderException`, `OptimisticLockException`, `IllegalStateException` | oversell, reused key, concurrent balance update, cancel of a non-NEW order |
| 404 | `ORD-409` (sic) | `OrderNotFoundException` | cancel of an unknown order id |
| 404 | `WL-404` | `NoSuchElementException` | unknown watchlist |
| 409 | `WL-409` | `DuplicateKeyException`, `DefaultWatchlistProtectedException` | duplicate name; deleting the default list |
| 422 | `VAL-422` | `InvalidOrderArgumentException`, `MethodArgumentNotValidException`, `ConstraintViolationException`, `MethodArgumentTypeMismatchException`, `HttpMessageNotReadableException` | bad or unknown fields, bad enum, bad JSON |
| 404 | `API-404` | `NoHandlerFoundException` | unknown route |
| 500 | `ERR-500` | anything else | unexpected error (e.g. `UserNotActiveException` USR-403 isn't mapped) |

---

## Part 12: Testing

105 tests in 18 files under `src/test/java` (JUnit 5 + Mockito, via `spring-boot-starter-test`).

| Area | Files | What they prove |
|---|---|---|
| Controllers | `AccountControllerTest`, `OrderControllerTest`, `WatchlistControllerTest`, `InternalAccountControllerTest` | routing, status codes, that the token account wins over the path or body, internal token checks |
| Services | `AccountServiceTest`, `AuthServiceTest`, `InternalAccountServiceTest`, `WatchlistServiceTest`, `LatestPriceCacheTest` | business behaviour with mocked mappers |
| Security | `JwtAuthenticationFilterTest`, `JwtTokenProviderTest`, `SecurityConfigCorsTest` | valid/expired/forged tokens, preflight handling |
| Kafka | `MarketDataConsumerTest`, `UserRegisteredEventConsumerTest` | parsing, cache updates, idempotent provisioning |
| Errors | `ApiExceptionHandlerTest` | exception → code/status mapping |
| **Characterisation** | `OrderPlacementCharacterisationTest`, `OrderSettlementCharacterisationTest` | record exactly what order placement does at the HTTP edge and in the DB, **before** refactoring it (a safety net for changing legacy behaviour) |
| Smoke | `SpringBootAppApplicationTests` | context loads |

The domain rules are tested in `domain-engine` (148 tests), and the full journeys are tested by the frontend's
Playwright suite (`place-order`, `blotter`, `funds`, `watchlist`, `session`, `api-security`).

---

## Part 13: Commands cheat sheet

```bash
# 1. Install the shared library into your local Maven repo (once, and after changing it)
cd Application/Services/shared-libs/domain-engine
mvn clean install            # add -DskipTests to skip its 148 tests

# 2. Run the Trade REST API
cd Application/Services/order-service
export DB_URL=jdbc:postgresql://localhost:5432/trading_system DB_USERNAME=postgres DB_PASSWORD=...
export JWT_SECRET=<same value as the auth service> KAFKA_BOOTSTRAP_SERVERS=localhost:9092
./mvnw spring-boot:run       # Windows: mvnw.cmd spring-boot:run
./mvnw test                  # unit tests
./mvnw -Dtest='*Characterisation*' test
./mvnw clean package         # builds target/spring-boot-app-1.jar

# docs:  http://localhost:8080/swagger-ui   (JSON at /api-docs)
```

---

## Part 14: Known issues, risks and technical debt

Ordered roughly by severity.

1. **Anyone signed in can cancel anyone's order.** `DELETE /api/v1/orders/{id}` only checks that a bearer header
   exists (`requireBearerToken`). `cancelOrder` never compares the order's account with the token's account, and
   order ids are sequential, so they're easy to guess. This is an **IDOR** (insecure direct object reference).
   The fix is to load the order and require `order.account == token accountId` (else ACC-403/404).
2. **A weak default JWT secret.** `jwt.secret` falls back to a well-known placeholder string. If `JWT_SECRET`
   isn't set, anyone who knows the default can forge tokens. Failing startup when the variable is missing would
   be safer.
3. **Secrets in stdout.** `InternalAccountController` `System.out.println`s the raw `Authorization` header, and
   `JwtTokenProvider` prints the secret when it's too short.
4. **Customers set their own balance.** `PATCH /accounts/me/balance` lets a user set any non-negative cash value.
   It's fine as a demo "funds" feature, but in a real system deposits and withdrawals would be separate audited
   operations with a source of funds.
5. **`MAX(id) + 1` id generation** for orders, positions and watchlists races under concurrency (two requests get
   the same id, and one fails on the primary key). That's why the e2e suite runs with one worker. DB sequences or
   identity columns fix it.
6. **The order event can be lost.** The `afterCommit` send isn't checked, and there's no outbox. If Kafka is down
   right after commit, the order stays `NEW` forever and the executor never sees it. An **outbox table**, or
   checking the send result, would fix it.
7. **Kafka offsets are probably never committed.** `spring.kafka.listener.ack-mode=manual` is set globally, but
   neither listener takes an `Acknowledgment` or calls `acknowledge()`. With auto-commit off, offsets for
   `account-provisioning` and `watchlist-service` likely never advance, so every restart replays from `earliest`.
   That's harmless here only because account creation is idempotent and quotes are overwritten.
8. **`from`/`to` filters are ignored** in `getOrders`, although the API accepts them.
9. **Error mapping inconsistencies.**
   - `OrderNotFoundException` returns code `ORD-409` with status 404.
   - Every `IllegalStateException` (including "trading account not found" from the internal activate endpoint)
     becomes 409 "Order is not cancellable".
   - Every `DuplicateKeyException` (including an order primary-key collision) is labelled "Watchlist already
     exists".
   - `UserNotActiveException` (USR-403) isn't mapped, so it becomes 500.
10. **`@Transactional(REQUIRES_NEW)` self-invocation.** `WatchlistService.ensureDefaultWatchlist` is called from
    other methods of the same class, so the `REQUIRES_NEW` setting never applies (the proxy is bypassed).
11. **The services share one database.** `UserMapper` reads `auth.users` (the auth service's table) directly, and
    the executor writes `orders`/`positions`/`trading_accounts`. That's a shared database across services, which
    couples their schemas. Several queries also depend on `search_path` rather than schema-qualified names.
12. **N+1 queries.** Nested `@Arg(select=…)` lookups run extra queries per row (order → account → user,
    instrument).
13. **Odd balance fields.** Currency is hard-coded `"USD"`, `asOf` is "now" rather than the last update time, and
    `blocked_balance` is never used.
14. **Dead or leftover code:** `SettlementMapper`, `HoldingMapper.insertHolding` via the validator adapter,
    `AuthService.verifyAccountAccess`, `TradeEventPayload` (no consumer), empty `manifest.env`, deprecated
    `UserMapper.findUserByEmail`; the `AccountMapper` class comment about a type mismatch is outdated.
15. **No Dockerfile** for this service, unlike the executor.
16. **The `/{id}` account routes ignore the `{id}`.** `GET /api/v1/accounts/{id}`, `/{id}/balance`,
    `/{id}/positions` and `/{id}/orders` all read the account from the token (`authenticatedAccountId`) and never
    look at the path. Asking for another account's orders returns **your own** orders with 200. No data leaks,
    but the contract says a token whose `accountId` doesn't match the addressed account gets `ACC-403`. Calling
    `verifyAccountAccess` in those handlers would fix it. The frontend's Playwright test for this was removed
    because it failed.

---

## Part 15: Review questions and answers

**Architecture**

1. **What does this service own?**
   Trading accounts, cash, positions, holdings, orders, instruments and watchlists, stored in the `trading`
   schema. It accepts orders but doesn't execute them.

2. **Why separate order placement from execution?**
   Placement must answer fast and reliably; execution needs a live quote from an external API that can be slow or
   down. Decoupling them via Kafka lets the API respond `NEW` immediately, lets the executor scale and retry
   independently, and keeps the order safely queued if the executor is down.

3. **What is the domain-engine and why is Spring banned from it?**
   A plain-Java library with the entities, the validator and the business exceptions. The Maven Enforcer bans
   frameworks so the rules stay pure, portable and testable without a DB or container; the apps adapt it to
   MyBatis (ports and adapters).

4. **Why MyBatis instead of JPA?**
   Explicit, reviewable SQL, easy mapping to immutable constructor-based domain objects, and no hidden lazy-loading
   or dirty checking. The cost is more boilerplate and manual relationship loading.

5. **What does `@Transactional` do in `placeOrder`?**
   It wraps the reads, validation and insert in one DB transaction, and lets the Kafka send be registered to run
   only after a successful commit.

**Security**

6. **How is a request authenticated?**
   The servlet filter checks the Bearer JWT (HS256 signature, expiry, algorithm) with the secret shared with the
   auth service, and stores `accountId` on the request.

7. **How do you stop a user reading another account?**
   The account always comes from the token. `/accounts/{id}` ignores `{id}`; order placement replaces `accountId`;
   watchlists check ownership. (Cancel is the gap; see Part 14.)

8. **How are the internal endpoints protected?**
   They need a short-lived internal JWT with `service = "auth-service"` signed with the same secret; customer
   tokens fail that check, and the endpoints aren't published in Swagger.

9. **Why is CORS ordered before the JWT filter?**
   Browser preflight `OPTIONS` requests carry no token. If auth ran first they'd get 401 and the real request
   would never be sent.

10. **How is SQL injection prevented?**
    MyBatis `#{}` placeholders become JDBC bind parameters; user input is never concatenated into SQL.

**Orders and money**

11. **Walk through placing an order.**
    Filter → domain request validation → controller swaps in the token account → load account and instrument →
    `OrderValidator` (active user/account, instrument tradable, funds for BUY, new idempotency key, holdings for
    SELL) → insert `NEW` → after commit, publish `ORDER_PLACED` keyed by accountId → 200 `NEW`.

12. **What is the idempotency key?**
    A client-generated UUID per logical order. If the same key is seen again, the order is refused with ORD-409, so
    a retried request can't create a duplicate order.

13. **Why key the `orders` topic by accountId?**
    Kafka only orders messages within a partition; keying by account keeps one account's orders in sequence for
    the executor while spreading accounts across partitions.

14. **Why publish after commit?**
    Publishing inside the transaction could announce an order that then rolls back. After commit, an event always
    refers to a saved order. (The remaining risk is a lost send, which an outbox fixes.)

15. **Is cash deducted at placement?**
    No. Placement only checks affordability; the executor moves cash at fill time and re-checks funds then.

16. **What is optimistic locking here?**
    Each account row has a `version`. Updates say `WHERE version = <what I read>` and increment it; 0 rows means
    someone else changed it first, so the update is refused (409) or retried, rather than silently overwriting.

17. **How is the weighted average cost computed?**
    `(oldAvg × oldQty + price × qty) / (oldQty + qty)`; selling keeps the average and reduces quantity.

18. **How does cancel avoid racing a fill?**
    `UPDATE … WHERE status = 'NEW'` is a compare-and-set; if the executor already filled it, 0 rows are updated
    and the cancel is refused.

**Kafka and prices**

19. **How is a trading account created?**
    The auth service publishes `USER_REGISTERED`; this service's consumer (group `account-provisioning`) creates a
    PENDING account idempotently and seeds a default watchlist.

20. **Where do live prices come from?**
    The executor polls the market-data provider and publishes `QUOTE` events; this service caches the latest quote
    per symbol in memory and uses it in positions, watchlists and search. Prices are never stored.

21. **What happens to prices after a restart?**
    The cache is empty until new quotes arrive; responses fall back to `null` (positions) or the instrument's
    reference price (watchlists).

22. **What is a consumer group?**
    A named logical consumer; Kafka splits a topic's partitions among the group's instances and tracks one offset
    per group. Different groups each get every message.

**Quality**

23. **What are characterisation tests?**
    Tests that pin down existing behaviour (even behaviour you disagree with) before changing code, so the change
    is deliberate and visible.

24. **Top issues you'd fix?**
    The cancel IDOR, the default JWT secret, the printed secrets, `MAX+1` ids, the missing outbox, and the
    unacknowledged Kafka offsets.

---

## Part 16: Glossary

| Term | Meaning |
|---|---|
| **Bean** | an object created and managed by Spring |
| **Auto-configuration** | Spring Boot setting things up from classpath + properties |
| **Filter** | servlet component that runs before controllers for matching URLs |
| **`@RestControllerAdvice`** | global exception → response mapping |
| **Record** | immutable Java data class |
| **Bean Validation** | `@NotNull`, `@Size`… annotations checked by `@Valid` |
| **MyBatis mapper** | annotated interface whose SQL MyBatis implements |
| **Bind parameter** | `#{x}` → JDBC `?`; the defence against SQL injection |
| **N+1 queries** | one query for a list plus one per row for related data |
| **Optimistic locking** | detect concurrent updates with a version column instead of locking rows |
| **Idempotency key** | client id that makes retries safe |
| **IDOR** | insecure direct object reference: acting on someone else's object by changing an id |
| **Outbox pattern** | write the event to a DB table in the same transaction, publish it separately |
| **Envelope** | the shared outer JSON structure of every Kafka message |
| **Consumer group / offset** | named consumer / its position in a partition |
| **Limit order** | buy at most / sell at least a given price |
| **DELIVERY vs INTRADAY** | holding shares beyond the day vs closing within the day |
| **Weighted average cost** | average purchase price across buys |
| **Ports and adapters** | domain defines interfaces; infrastructure implements them |
