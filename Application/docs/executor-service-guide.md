# Trade Executor (executor-service): the complete guide

This guide explains the Spring Boot service that **executes orders** and **polls live market prices**. It covers
every folder, every file, what each one does, and how they work together, using **real flows** (an order is
filled, rejected, redelivered, dead-lettered; a price poll runs) to show where each file comes into play.

- **Code location:** [Application/Services/executor-service/](../Services/executor-service/)
- **Companion guides:** [order-service-guide.md](order-service-guide.md) (accepts the orders this service fills,
  and explains Spring Boot, MyBatis and the shared domain-engine in depth),
  [frontend-app-guide.md](frontend-app-guide.md), [auth-service-guide.md](auth-service-guide.md)

Package paths are abbreviated: `…/tradeexecutor/` means `executor-service/src/main/java/com/tradeexecutor/`.

---

## Table of contents

- [Part 0: The 60-second mental model](#part-0-the-60-second-mental-model)
- [Part 1: Concepts you need (Kafka, reliability, trading)](#part-1-concepts-you-need-kafka-reliability-trading)
- [Part 2: Folder and file map](#part-2-folder-and-file-map)
- [Part 3: Build, configuration and environment variables](#part-3-build-configuration-and-environment-variables)
- [Part 4: How the service boots](#part-4-how-the-service-boots)
- [Part 5: Inputs and outputs at a glance](#part-5-inputs-and-outputs-at-a-glance)
- [Part 6: The code, file by file](#part-6-the-code-file-by-file)
- [Part 7: Flows end to end](#part-7-flows-end-to-end)
- [Part 8: The money and position math](#part-8-the-money-and-position-math)
- [Part 9: Reliability and delivery semantics](#part-9-reliability-and-delivery-semantics)
- [Part 10: Testing](#part-10-testing)
- [Part 11: Commands cheat sheet](#part-11-commands-cheat-sheet)
- [Part 12: Known issues, risks and technical debt](#part-12-known-issues-risks-and-technical-debt)
- [Part 13: Review questions and answers](#part-13-review-questions-and-answers)
- [Part 14: Glossary](#part-14-glossary)

---

## Part 0: The 60-second mental model

The executor has **no public REST API**. It has two jobs, both driven by background work rather than HTTP
requests:

```
                         ┌───────────────── trade-executor (Spring Boot, :8081) ─────────────────┐
 order-service           │                                                                       │
  └─ORDER_PLACED────────►│ OrderPlacedConsumer (manual ack, retry + DLT)                         │
     topic "orders"      │      └─► ExecutionService.processOrderPlaced                           │
     key = accountId     │            1. load order + instrument (MyBatis)                         │
                         │            2. OrderExecutor: Fauxnance quote ─► DefaultFillRule         │
                         │            3. re-verify account / cash / holdings at execution time     │
                         │            4. SettlementService (one DB transaction):                    │
                         │                 order NEW→FILLED|REJECTED, cash ±, position, holding     │
                         │                 └─► publish ORDER_FILLED / ORDER_REJECTED ──────────────┼──► "trade-events"
                         │      failure: retry with backoff, then ─────────────────────────────────┼──► "orders.DLT"
                         │                                                                       │
                         │ QuotePollerService (@Scheduled, every ≥ 30 s)                          │
                         │      symbols = positions ∪ watchlists (DB)                              │
                         │      FauxnanceClient.getQuotesBatch (≤ 25 symbols per HTTP call) ─────┼──► Fauxnance API
                         │      one QUOTE per symbol ──────────────────────────────────────────────┼──► "market-data"
                         └───────────────┬───────────────────────────────────────────────────────┘
                                         │ SQL (shared trading_system DB)
                                         ▼
                       trading.orders · trading_accounts · positions · holdings · instruments ·
                       watchlist_inst · auth.users
```

Six ideas explain almost everything:

1. **Orders arrive as Kafka events, not HTTP calls.** The order-service saved the order as `NEW` and published
   `ORDER_PLACED`; the executor picks it up asynchronously.
2. **A limit order is filled or rejected immediately** against the **current quote**: BUY fills at the **ask** if
   `limit ≥ ask`; SELL fills at the **bid** if `limit ≤ bid`; otherwise it's rejected. It never "rests" in a book.
3. **Execution-time re-checks**: just before settling, it re-reads the account and checks it's still ACTIVE, can
   still afford the trade, and still holds enough to sell.
4. **Settlement is one DB transaction**: mark the order, move cash (with optimistic locking and retries), update
   the position and holding.
5. **Safe against duplicates**: the order update is `WHERE status = 'NEW'`, so a redelivered message changes
   nothing the second time.
6. **The poller is the platform's only source of live prices.** It queries the external **Fauxnance** API (whose
   API key must stay server-side) and fans quotes out on `market-data`.

---

## Part 1: Concepts you need (Kafka, reliability, trading)

Spring Boot basics (beans, DI, `@Transactional`, MyBatis annotations, `application.*` config) are explained in
[order-service-guide.md Part 1](order-service-guide.md#part-1-spring-boot-crash-course-only-what-this-service-uses).
This section covers what's specific to the executor.

### 1.1 Kafka in one page

- A **topic** is split into **partitions**; each message has a **key**, and the same key always goes to the same
  partition. **Ordering is guaranteed only within a partition.**
- `orders` is keyed by `accountId` (3 partitions), so one account's orders are processed in order.
  `market-data` is keyed by symbol (6 partitions).
- A **consumer group** shares a topic's partitions among its instances. `orders` has **exactly one** consumer
  group (the executor). It's a **work queue**: a second group would execute every order twice.
- Each group stores an **offset** per partition, meaning "processed up to here". Committing the offset is
  **acknowledging** the message.
- **Manual ack mode** means the offset is committed only when code calls `ack.acknowledge()`. If the service
  crashes before that, the message is delivered again. That's **at-least-once delivery**.

### 1.2 At-least-once means the consumer must be idempotent

Because a message can arrive twice, processing it twice must have the same effect as once. The executor does this
with **conditional updates**: `UPDATE orders SET status='FILLED' … WHERE order_id=? AND status='NEW'`. The second
attempt updates 0 rows and stops.

### 1.3 Retries, backoff and the dead-letter topic

- **Transient failure** (DB blip, timeout, lock contention): might succeed later, so **retry** with
  **exponential backoff** (100 ms, 200 ms, 400 ms… capped).
- **Permanent failure** (bad message, order not in DB, unknown symbol): will never succeed, so **don't retry**.
- Either way, a message that can't be processed goes to a **dead-letter topic (DLT)**, `orders.DLT`, and is
  acknowledged so it doesn't block the partition. One "poison" message must never stop every other account on
  that partition.

### 1.4 Optimistic locking

The account row has a `version`. To change cash: read the balance and version, then
`UPDATE … SET balance = new, version = version + 1 WHERE id = ? AND version = <read>`. If 0 rows change, someone
else updated it first, so **re-read and try again** (bounded retries).

### 1.5 Trading vocabulary

| Term | Meaning |
|---|---|
| **Bid** | highest price a buyer will pay; **you sell at the bid** |
| **Ask** | lowest price a seller will accept; **you buy at the ask** |
| **Last price** | last observed trade; nothing transacts there |
| **Spread** | ask − bid |
| **Limit order** | BUY: pay at most the limit; SELL: receive at least the limit |
| **Position** | how many shares you hold and their average cost |
| **Holding** | the same idea for DELIVERY (settled) shares, kept in `trading.holdings` |
| **Fill** | the order executes at an execution price |

### 1.6 Scheduling and HTTP

- `@EnableScheduling` + `@Scheduled(fixedRateString = …)` runs a method repeatedly on a timer thread.
- `RestTemplate` is Spring's synchronous HTTP client; `FauxnanceClient` uses it to call the market-data API.

---

## Part 2: Folder and file map

```
executor-service/
├── pom.xml                 Spring Boot 3.3.0, Java 21: web (RestTemplate + Tomcat), spring-kafka, PostgreSQL,
│                           MyBatis 3.0.3, domain-engine; tests: spring-kafka-test, Mockito 5.20, ByteBuddy 1.17
├── Dockerfile              two-stage: build domain-engine + executor with Maven, run on JRE 21
├── manifest.env            sprint 7 package-structure manifest
├── README.md               outdated sprint 7 notes (points at sprint07 paths)
├── LOGGING_GUIDE.md        empty file
├── .gitignore, target/
└── src/
    ├── main/resources/application.yml       port 8081, Kafka, datasource, DLT retry, Fauxnance, poller
    └── main/java/com/tradeexecutor/
        ├── TradeExecutorApplication.java      @SpringBootApplication @EnableScheduling @MapperScan
        ├── config/
        │   ├── KafkaConfig.java               two producer templates: JSON envelopes + raw bytes (DLT)
        │   └── TradeExecutorConfig.java       RestTemplate bean
        ├── kafka/
        │   ├── KafkaConsumerConfig.java       consumer factory (JSON → envelope) + MANUAL-ack container
        │   ├── KafkaMessageEnvelope.java      the shared 6-field envelope (record)
        │   ├── KafkaProducer.java             publishQuote → market-data, publishTradeEvent → trade-events
        │   ├── DeadLetterPublisher.java       sends a failed message to <topic>.DLT
        │   ├── RetryHandler.java              shouldRetry / exponential backoff / sleep
        │   ├── QuotePayload.java              QUOTE body (record)
        │   └── EventEnvelope.java             unused mutable envelope
        ├── consumer/
        │   └── OrderPlacedConsumer.java       @KafkaListener("orders"): process → ack, or retry → DLT → ack
        ├── service/
        │   ├── ExecutionService.java          orchestrates one order: load → execute → re-verify → settle
        │   └── SettlementService.java         @Transactional DB writes + trade event
        ├── execution/
        │   ├── OrderExecutor.java             tradability check → Fauxnance quote → fill rule
        │   ├── FillRule.java                  pure-function interface
        │   ├── DefaultFillRule.java           BUY at ask if limit ≥ ask; SELL at bid if limit ≤ bid
        │   ├── ExecutionResult.java           FILLED | REJECTED | PRICING_UNAVAILABLE | INSTRUMENT_NOT_TRADABLE
        │   └── ExecutionDecision.java         result + fill-rule name
        ├── client/
        │   ├── FauxnanceClient.java           GET /quotes/{symbol} and /quotes?symbols=… with X-Api-Key + retries
        │   ├── QuoteResponse.java  QuoteResponseWrapper.java  BatchQuoteItem.java  BatchQuotesData.java
        │   └── BatchQuotesResponseWrapper.java
        ├── poller/
        │   └── QuotePollerService.java        @Scheduled: discover symbols → batch fetch → publish
        ├── mapper/                            MyBatis SQL: Order, Account, Position, Holding, Instrument,
        │                                      User, Watchlist
        ├── model/
        │   ├── OrderPlacedEvent.java          ORDER_PLACED payload (what the consumer reads)
        │   ├── TradeEvent.java                ORDER_FILLED/REJECTED payload (what it publishes)
        │   └── Account / Order / Position / Quote.java   empty TODO placeholders
        ├── entity/Position.java               unused POJO
        └── exception/
            ├── ExecutionException.java        abstract: isRetryable(), getFailureReason()
            ├── PermanentProcessingException.java   isRetryable = false
            └── TransientProcessingException.java   isRetryable = true
    └── test/java/com/tradeexecutor/           122 tests in 23 files (see Part 10)
```

It reuses domain-engine **entities and enums** (`Order`, `Account`, `Instrument`, `Position`, `Holding`,
`OrderSide`, `TradingStatus`…) but **not** its validator or executor classes.

---

## Part 3: Build, configuration and environment variables

### [pom.xml](../Services/executor-service/pom.xml)

`spring-boot-starter-parent 3.3.0`, Java 21. It depends on `domain-engine:1` (install it locally first),
`spring-boot-starter-web` (for `RestTemplate`; it also starts Tomcat), `spring-kafka`, `postgresql` and
`mybatis-spring-boot-starter`. The test dependencies pin Mockito 5.20 and ByteBuddy 1.17 so mocking works on newer
JDKs.

### [application.yml](../Services/executor-service/src/main/resources/application.yml)

| Setting | Env var (default) | Meaning |
|---|---|---|
| `server.port` | `8081` | Tomcat port (there are no endpoints; the Trade API owns 8080) |
| `spring.kafka.bootstrap-servers` | `KAFKA_BOOTSTRAP_SERVERS` (`localhost:9092`) | brokers |
| `spring.kafka.consumer.group-id` | `KAFKA_CONSUMER_GROUP` (`trade-executor-group`) | the `orders` consumer group |
| `consumer.auto-offset-reset` | `earliest` | a new group starts at the beginning |
| producer `acks: all`, `enable-idempotence`, `retries: 10` | | durable, de-duplicated sends |
| `spring.datasource.url/username/password` | `DB_URL` (`jdbc:postgresql://localhost:5432/trading_system`), `DB_USERNAME` (`postgres`), `DB_PASSWORD` (`postgres`) | database |
| `app.dlt.max-retries` | `APP_DLT_MAX_RETRIES` (3) | total processing attempts before DLT |
| `app.dlt.initial-backoff-ms` / `backoff-multiplier` / `max-backoff-ms` | 100 / 2.0 / 30000 | exponential backoff |
| `app.fauxnance.base-url` | `FAUXNANCE_BASE_URL` (**required**) | market-data API |
| `app.fauxnance.api-key` | `FAUXNANCE_API_KEY` (**required**) | sent as `X-Api-Key`; never leaves the backend |
| `app.fauxnance.retry.max-attempts` / `delay-ms` | 1 / 100 | HTTP retries per call |
| `app.poller.poll-interval-ms` | `POLL_INTERVAL_SECONDS` (30000) | poll period, **in milliseconds** despite the variable name |
| `app.settlement.optimistic-lock-retries` | (3, in code) | cash-update retries |
| `logging.level.com.tradeexecutor` | DEBUG | verbose logs |

### [Dockerfile](../Services/executor-service/Dockerfile)

A **multi-stage build** whose build context is `Application/Services` (because it needs the sibling
`shared-libs` folder):
1. `maven:3.9-eclipse-temurin-21`: copy and `mvn install` **domain-engine**, then copy and `mvn package` the
   executor (tests skipped). Copying the `pom.xml` and running `dependency:go-offline` before copying the sources
   is a **layer-caching** trick, so dependencies aren't re-downloaded on every code change.
2. `eclipse-temurin:21-jre`: copy only the jar, `java -jar app.jar`.

```bash
docker build -f executor-service/Dockerfile -t trade-executor Application/Services
```

---

## Part 4: How the service boots

1. [TradeExecutorApplication](../Services/executor-service/src/main/java/com/tradeexecutor/TradeExecutorApplication.java):
   `@SpringBootApplication`, **`@EnableScheduling`** (turns on the poller), **`@MapperScan("com.tradeexecutor.mapper")`**
   (registers the MyBatis mappers).
2. Beans: the datasource + MyBatis, `RestTemplate`, two `KafkaTemplate`s (`KafkaConfig`), the consumer factory and
   listener container (`KafkaConsumerConfig`, **concurrency 1, MANUAL ack**), `FauxnanceClient`, `RetryHandler`
   and the services.
3. `QuotePollerService`'s constructor logs a **quota analysis** table (requests per day for 1–100 symbols at the
   configured interval).
4. The `orders` listener container starts polling Kafka; the scheduler starts calling `pollAndPublishQuotes()`.
5. Tomcat listens on 8081 (no controllers).

**Prerequisites:** PostgreSQL with migrations and `search_path = auth, trading, public` (many mapper queries use
unqualified table names), Kafka with the topics created (`Infrastructure/Kafka/scripts/create-topics.sh`), the
Fauxnance URL and key, and domain-engine installed.

---

## Part 5: Inputs and outputs at a glance

| Direction | What | Details |
|---|---|---|
| **In** (Kafka) | `orders` topic, `ORDER_PLACED` | group `trade-executor-group`, key = accountId, one listener thread |
| **In** (HTTP out-call) | Fauxnance `GET {base}/quotes/{symbol}` | per-order quote; header `X-Api-Key` |
| **In** (HTTP out-call) | Fauxnance `GET {base}/quotes?symbols=A,B,…` | poller batch, ≤ 25 symbols per call |
| **In** (DB reads) | `orders`, `instruments`, `trading_accounts`, `positions`, `holdings`, `watchlist_inst`, `users` | |
| **Out** (DB writes) | `orders` (status, `filled_price`, `filled_at`, `executor_version`), `trading_accounts` (cash, version), `positions`, `holdings` | all inside `SettlementService`'s transaction |
| **Out** (Kafka) | `trade-events`: `ORDER_FILLED` / `ORDER_REJECTED` | key = accountId, source `trade-executor` |
| **Out** (Kafka) | `market-data`: `QUOTE` | key = symbol, source `market-poller` |
| **Out** (Kafka) | `orders.DLT` | failed `ORDER_PLACED` messages |

---

## Part 6: The code, file by file

### 6.1 Kafka configuration

**[config/KafkaConfig.java](../Services/executor-service/src/main/java/com/tradeexecutor/config/KafkaConfig.java)**
creates two producer templates with the same durable settings (`acks=all`, idempotence, 10 retries, 5 in-flight):
- `kafkaTemplate`: `KafkaTemplate<String, KafkaMessageEnvelope<?>>` with `JsonSerializer`, for `trade-events` and
  `market-data`.
- `rawBytesKafkaTemplate`: `KafkaTemplate<String, byte[]>` with `ByteArraySerializer`, for DLT topics.

**[kafka/KafkaConsumerConfig.java](../Services/executor-service/src/main/java/com/tradeexecutor/kafka/KafkaConsumerConfig.java)**:
- `consumerFactory`: String keys; values via a `JsonDeserializer` typed to
  `KafkaMessageEnvelope<OrderPlacedEvent>` (trusts all packages, ignores type headers, so plain JSON from the
  order-service deserialises).
- `kafkaListenerContainerFactory`: **`AckMode.MANUAL`**, **concurrency 1** (one thread, so strict in-order
  processing per partition assignment), and Spring's `DefaultErrorHandler`.

### 6.2 [consumer/OrderPlacedConsumer.java](../Services/executor-service/src/main/java/com/tradeexecutor/consumer/OrderPlacedConsumer.java)

`@KafkaListener(topics = "orders", containerFactory = "kafkaListenerContainerFactory")`:

```
onOrderPlaced(record, envelope, ack)
  ├─ envelope or payload null → handlePermanentFailure → DLT + ack
  └─ processWithRetry:
       loop attempt = 1, 2, 3 …
         try  executionService.processOrderPlaced(event) → ack → done
         catch ExecutionException e
              e not retryable (Permanent)        → DLT + ack → done
              retryable and attempts left         → waitForBackoff → loop
              retryable and no attempts left      → DLT + ack → done
         catch any other Exception (treated as transient)
              attempts left → backoff → loop; else DLT + ack → done
```

The message is **always acknowledged in the end** (success or DLT), so one bad order can't block the partition.

### 6.3 [kafka/RetryHandler.java](../Services/executor-service/src/main/java/com/tradeexecutor/kafka/RetryHandler.java)

- `shouldRetry(attempt)` = `attempt < maxRetries`. With `max-retries: 3` that's **3 attempts in total**.
- `calculateBackoffMs(attempt)` = `min(initial × multiplier^(attempt−1), max)` → 100 ms, 200 ms, 400 ms…
- `waitForBackoff` = `Thread.sleep` (it blocks the single consumer thread; acceptable at this scale).

### 6.4 [kafka/DeadLetterPublisher.java](../Services/executor-service/src/main/java/com/tradeexecutor/kafka/DeadLetterPublisher.java)

`publishToDeadLetter("orders", key, bytes, reason)` sends to **`orders.DLT`** with the same key. It never throws
(failing to dead-letter must not cause an infinite loop); errors are logged. Two caveats are listed in Part 12:
the `failure-reason` header is built but not sent, and the bytes are the re-serialised envelope rather than the
original record.

### 6.5 [service/ExecutionService.java](../Services/executor-service/src/main/java/com/tradeexecutor/service/ExecutionService.java)

`processOrderPlaced(event)`:
1. **Validate the event**: `orderId` must be present and numeric, and `accountId` present, else
   `PermanentProcessingException`.
2. **Load from the DB, which is the source of truth** (it doesn't trust the event's price or side):
   `orderMapper.findOrderById` (order not found → permanent) and `instrumentMapper.findInstrumentBySymbol`
   (unknown → permanent).
3. `orderExecutor.execute(order, instrument)` → an `ExecutionDecision`.
4. If FILLED → `reverifyAtExecutionTime`, which re-reads the account:
   - status not ACTIVE → REJECTED "Account is not active"
   - BUY and `!canAfford(executionPrice × qty)` → REJECTED "Insufficient funds at execution time"
   - SELL and position quantity < order quantity → REJECTED "Insufficient holdings at execution time"
5. FILLED → `settlementService.settleOrder(..., executionPrice, ...)`; REJECTED → `settleOrder(..., null, ...)`.
6. **`PRICING_UNAVAILABLE` / `INSTRUMENT_NOT_TRADABLE` → only a warning log.** The order is not settled and stays
   `NEW` (see Part 12).

### 6.6 [execution/](../Services/executor-service/src/main/java/com/tradeexecutor/execution/)

**`OrderExecutor.execute(order, instrument)`**:
1. `instrument.mayBeTraded()` is false → `INSTRUMENT_NOT_TRADABLE`.
2. `fauxnanceClient.getQuote(symbol)`; nothing → `PRICING_UNAVAILABLE`.
3. bid/ask missing → **fall back to the last price** for both; still missing → `PRICING_UNAVAILABLE`.
4. `fillRule.evaluate(order, bid, ask)`.

**`FillRule`** is an interface whose contract says implementations must be **pure functions**: no DB, HTTP,
Kafka, I/O or state, and deterministic. That makes the trading logic trivial to unit-test and swappable (e.g. a
future IOC/FOK rule).

**`DefaultFillRule`**:

| Side | Fills when | Execution price | Otherwise |
|---|---|---|---|
| BUY | `limitPrice ≥ ask` | **ask** | REJECTED "BUY order limit price X is below ask Y" |
| SELL | `limitPrice ≤ bid` | **bid** | REJECTED "SELL order limit price X is above bid Y" |

The trader gets the market price, which is **as good as or better than** their limit.

**`ExecutionResult`** holds the status + `executionPrice` (only for FILLED) + reason. **`ExecutionDecision`**
wraps it with the rule's name.

### 6.7 [service/SettlementService.java](../Services/executor-service/src/main/java/com/tradeexecutor/service/SettlementService.java)

`settleOrder(...)` is **`@Transactional(rollbackFor = Exception.class)`**: all DB writes commit together or not
at all.

**FILLED path (`settleFilled`):**
1. `orderMapper.markOrderFilled(orderId, price)` →
   `UPDATE orders SET status='FILLED', filled_price=?, filled_at=now, executor_version=executor_version+1 WHERE
   order_id=? AND status='NEW'`. **0 rows = duplicate delivery or already cancelled → stop** (no cash or position
   change).
2. `updateAccountCashWithOptimisticLocking`: BUY → `−price×qty`, SELL → `+price×qty`; read the balance + version →
   `updateAvailableBalanceOptimistic`; 0 rows → re-read and retry up to `optimistic-lock-retries` (3); exhausted →
   `IllegalStateException` → transaction rolls back → the consumer treats it as transient and retries.
3. Reload the order; product `DELIVERY` (what the order-service always uses) → **`updateHolding` and
   `updatePosition`**; INTRADAY → position only.
4. **`updatePosition` / `updateHolding`:**
   - existing row + BUY → new qty, **weighted average cost**
   - existing row + SELL → qty − sold (negative → error); the average is unchanged; **qty 0 → delete the row**
   - no row + BUY → insert (position id `MAX+1`, holding id `System.nanoTime()`)
   - no row + SELL → `IllegalStateException`

**REJECTED path (`settleRejected`):** `markOrderRejected` → `status='REJECTED', filled_price=NULL, filled_at=now
WHERE status='NEW'`.

**Then, for both:** `publishTradeEvent(orderId, accountId, result)` → `KafkaProducer.publishTradeEvent` →
`trade-events`. If publishing throws, the exception propagates and the transaction rolls back.

### 6.8 [kafka/KafkaProducer.java](../Services/executor-service/src/main/java/com/tradeexecutor/kafka/KafkaProducer.java)

- `publishTradeEvent(accountId, TradeEvent)` wraps it in an envelope (`eventType` `ORDER_FILLED` / `ORDER_REJECTED`
  / `ORDER_<status>`, source `trade-executor`, schemaVersion 1) and sends to **`trade-events`**, key = accountId.
  Errors are rethrown.
- `publishQuote(symbol, QuotePayload)` wraps it in a `QUOTE` envelope, source `market-poller`, and sends to
  **`market-data`**, key = symbol. Errors are logged, not thrown.

`TradeEvent` carries `{ orderId, accountId, status, executionPrice, reason }`.

### 6.9 [client/FauxnanceClient.java](../Services/executor-service/src/main/java/com/tradeexecutor/client/FauxnanceClient.java)

The HTTP client for the external market-data API:
- `getQuote(symbol)` → `GET {base}/quotes/{symbol}` → `{ data: QuoteResponse, meta }` → `Optional<QuoteResponse>`.
- `getQuotesBatch(symbols)` → splits into chunks of **25** → `GET {base}/quotes?symbols=A,B,…` →
  `{ data: { quotes: [ { symbol, source, stale, quote, error } ] } }`; it keeps the items without an error and logs
  the rest.
- Both retry `RestClientException` up to `max-attempts` with a fixed delay, then give up (empty/partial result).
  Neither throws.
- The API key goes in the `X-Api-Key` header.

`QuoteResponse` fields: `symbol, price, bid, ask, spreadBps, currency, change, changePercent, previousClose, asOf,
marketState, timestamp`.

### 6.10 [poller/QuotePollerService.java](../Services/executor-service/src/main/java/com/tradeexecutor/poller/QuotePollerService.java)

`@Scheduled(fixedRateString = "${app.poller.poll-interval-ms:120000}") pollAndPublishQuotes()`:
1. **`discoverSymbols()`** = `positionMapper.findAllDistinctSymbols()` (positions with qty > 0) **∪**
   `watchlistMapper.findAllDistinctWatchlistSymbols()`, deduplicated in a `Set`. Each symbol is requested **once
   per cycle**, however many users watch or hold it. Watchlist failures are tolerated (positions only).
2. `fauxnanceClient.getQuotesBatch(symbols)`.
3. For each quote → `QuotePayload(symbol, price, bid, ask, currency ?? "USD", change, changePercent,
   previousClose, marketState ?? "unknown", stale=false, quoteAsOf = asOf ?? now)` → `publishQuote`.
4. Any exception is caught and logged, so the scheduler keeps running.

**Why the interval matters (the quota):** Fauxnance allows **2000 requests/day**.
`requests/day = 86400 / intervalSeconds × ceil(symbols / 25)`. With 8 symbols: 30 s → 2880/day (over),
44 s → 1964/day (OK). The constructor enforces a 30-second floor **for logging** and prints this table at startup.

### 6.11 [mapper/](../Services/executor-service/src/main/java/com/tradeexecutor/mapper/)

| Mapper | Used for |
|---|---|
| `OrderMapper` | `findOrderById` (nested account + instrument), **`markOrderFilled`**, **`markOrderRejected`** (both `WHERE status='NEW'`) |
| `AccountMapper` | `findAccountById` (nested holder), `getAccountVersion`, **`updateAvailableBalanceOptimistic`** |
| `PositionMapper` | `findPositionByAccountAndInstrument`, `nextPositionId` (MAX+1), insert/update/**delete**, `findAllDistinctSymbols` (poller) |
| `HoldingMapper` | find/insert/update/**delete** holdings (DELIVERY) |
| `InstrumentMapper` | `findInstrumentBySymbol` / ById |
| `UserMapper` | holder for the account (`users`, which resolves to `auth.users` via `search_path`) |
| `WatchlistMapper` | `findAllDistinctWatchlistSymbols` (poller) |

### 6.12 Models and exceptions

- `model/OrderPlacedEvent`: the `ORDER_PLACED` payload (`orderId` as a string, `accountId`, `symbol`, `side`,
  `quantity`, `price`, `idempotencyKey`, `createdOn`), with `ignoreUnknown = true`.
- `model/TradeEvent`: the published payload.
- `model/Account`, `Order`, `Position`, `Quote` and `entity/Position` are **empty or unused placeholders**; the
  real types come from domain-engine.
- `exception/`: `ExecutionException` (abstract, `isRetryable()`, `getFailureReason()`) →
  `PermanentProcessingException` (false, "PERMANENT: …") and `TransientProcessingException` (true, "TRANSIENT: …").
  This **classification drives** the consumer's retry-or-DLT decision.

---

## Part 7: Flows end to end

### Flow 1: A BUY order is filled (happy path)

**Scenario:** account 6 placed BUY 10 AAPL, limit 225.00. The order-service saved order 5001 as `NEW` and
published `ORDER_PLACED` (key "6").

1. `OrderPlacedConsumer.onOrderPlaced` receives the deserialised `KafkaMessageEnvelope<OrderPlacedEvent>`.
2. `ExecutionService.processOrderPlaced`: parse id 5001 → load the order (limit 225.00, BUY, qty 10, DELIVERY) and
   instrument AAPL.
3. `OrderExecutor`: tradable → `FauxnanceClient.getQuote("AAPL")` → bid 224.10 / ask 224.14.
4. `DefaultFillRule`: BUY, `225.00 ≥ 224.14` → **FILLED at 224.14**.
5. Re-verify: account ACTIVE; `224.14 × 10 = 2241.40` affordable.
6. `SettlementService.settleOrder` (one transaction):
   - `markOrderFilled(5001, 224.14)` → 1 row
   - cash: balance 10,000.00 → 7,758.60 (version 4 → 5)
   - holding AAPL: none → insert 10 @ 224.14
   - position AAPL: none → insert 10 @ 224.14
   - publish `ORDER_FILLED { orderId: 5001, accountId: 6, status: FILLED, executionPrice: 224.14 }` → `trade-events`
7. Commit → back in the consumer → **`ack.acknowledge()`**.
8. The UI's blotter, polling `GET /accounts/me/orders`, now shows **Filled** with fill price 224.14; the dashboard
   shows the new position.

### Flow 2: A BUY is rejected (limit below the ask)

Same as above but with limit 220.00: `220.00 < 224.14` → REJECTED "BUY order limit price 220.00 is below ask
224.14" → `markOrderRejected` → no cash or position change → publish `ORDER_REJECTED` → ack. The UI shows
**Rejected**.

### Flow 3: SELL, including selling everything

Holding 10 AAPL @ 224.14; SELL 10, limit 220.00; quote bid 226.00.
1. SELL fills when `limit ≤ bid` → `220.00 ≤ 226.00` → **FILLED at 226.00** (better than the limit).
2. Re-verify: position qty 10 ≥ 10.
3. Settlement: cash **+2,260.00**; holding qty 10 − 10 = 0 → **row deleted**; position the same → **row
   deleted**. (The order itself stays in `orders` as the audit trail.)

A partial sell (e.g. 4) leaves qty 6 with the **same average cost**, 224.14.

### Flow 4: Conditions changed between placement and execution

The customer placed two BUYs back to back, each affordable alone but not together (placement doesn't reserve
cash). The first fills and debits the cash. For the second, the fill rule says FILLED, but
`reverifyAtExecutionTime` finds `!canAfford` → **REJECTED "Insufficient funds at execution time"**. The same
protection applies to an account suspended after placement, or to holdings sold by an earlier order.

### Flow 5: The same message is delivered twice

The executor commits settlement but crashes **before** `ack.acknowledge()`. On restart Kafka redelivers
order 5001.
1. The quote is fetched again, the fill rule runs again…
2. `markOrderFilled(5001, …) WHERE status='NEW'` → **0 rows**, because the order is already FILLED → "Duplicate
   delivery detected" → **no second cash debit, no second position change**.
3. The message is acknowledged. (A duplicate `trade-events` message is still published; see Part 12.)

The same guard makes a **cancel** win cleanly: if the customer cancelled order 5001 before the executor ran, the
status is `CANCELLED`, so `WHERE status='NEW'` matches nothing and the order isn't filled.

### Flow 6: A transient failure is retried, then dead-lettered

The DB briefly refuses connections.
1. Attempt 1 throws (not an `ExecutionException`, so it's treated as transient) → `shouldRetry(1)` is true → sleep
   100 ms.
2. Attempt 2 fails again → sleep 200 ms.
3. Attempt 3 fails → `shouldRetry(3)` is false → **`DeadLetterPublisher` → `orders.DLT`** → ack.

Because each attempt's transaction rolled back, nothing half-written remains. An operator can inspect `orders.DLT`
and re-drive it.

### Flow 7: A permanent failure goes straight to the DLT

An `ORDER_PLACED` references order 99999, which doesn't exist → `PermanentProcessingException("Order not found")`
→ `isRetryable() == false` → **immediately** `orders.DLT` → ack. No retries are wasted on a message that can never
succeed.

### Flow 8: The quote is unavailable

Fauxnance is down → `getQuote` returns empty after its retries → `PRICING_UNAVAILABLE` → ExecutionService logs a
warning and **does nothing** → the consumer acks. The order stays **`NEW`**. The UI polls for up to 5 minutes and
then stops; the order is never retried automatically (see Part 12).

### Flow 9: A market-data poll cycle

Every interval (default 30 s, configured in ms):
1. Symbols = `{AAPL, MSFT}` from positions ∪ `{AAPL, NVDA, TSLA, …}` from watchlists → a deduplicated set.
2. One HTTP call per 25 symbols: `GET /quotes?symbols=AAPL,MSFT,NVDA,…` with `X-Api-Key`.
3. One `QUOTE` message per symbol to `market-data` (key = symbol).
4. The order-service's `MarketDataConsumer` updates its `LatestPriceCache`, and the UI sees new prices on the next
   watchlist/dashboard request.

---

## Part 8: The money and position math

All money is **`BigDecimal`** (never `double`), with 2 decimal places and `HALF_UP` rounding for averages.

| Event | Cash | Quantity | Average cost |
|---|---|---|---|
| BUY q @ p, no position | −p×q | q | p |
| BUY q @ p, have Q @ A | −p×q | Q+q | (A×Q + p×q)/(Q+q) |
| SELL q @ p, have Q @ A (q < Q) | +p×q | Q−q | A (unchanged) |
| SELL q @ p, have Q @ A (q = Q) | +p×q | 0 → row deleted | n/a |
| Rejected | 0 | unchanged | unchanged |

Worked example: hold 10 @ 224.14, buy 5 @ 230.00 → avg = (2241.40 + 1150.00)/15 = **226.09**. Sell 6 @ 228.00 →
cash +1,368.00, 9 left @ **226.09**. Keeping the average on sells is what makes **realised P&L** computable later:
(228.00 − 226.09) × 6.

---

## Part 9: Reliability and delivery semantics

| Guarantee | How it's achieved |
|---|---|
| **At-least-once processing** | manual ack after processing; a crash means redelivery |
| **Effectively-once state changes** | `WHERE status='NEW'` on order updates; a duplicate updates 0 rows and stops |
| **Atomic settlement** | `@Transactional(rollbackFor = Exception.class)` around order + cash + position + holding |
| **No lost cash updates** | optimistic locking with a bounded retry |
| **Per-account ordering** | `orders` keyed by accountId; concurrency 1 |
| **No poison-pill blocking** | permanent errors go straight to the DLT; transient ones after bounded retries; always ack |
| **Bounded external calls** | Fauxnance retries are capped; the poll interval respects the 2000/day quota |
| **Durable publishing** | producers use `acks=all` + idempotence |
| **Stale-decision protection** | execution-time re-verification of status, funds and holdings |
| **Secrets stay server-side** | the Fauxnance key lives only in the executor; the UI gets prices via the Trade API |

---

## Part 10: Testing

122 tests in 23 files (JUnit 5, Mockito, spring-kafka-test), in `src/test/java/com/tradeexecutor/`:

| Area | Test classes | What they cover |
|---|---|---|
| Fill rule | `DefaultFillRuleTest`, `DefaultFillRuleEdgeCaseTest` | BUY/SELL boundaries (limit == ask/bid), missing bid/ask, null limit |
| Executor | `OrderExecutorTest`, `OrderExecutorQuoteFallbackTest` | tradability, missing quote, last-price fallback |
| Consumer | `OrderPlacedConsumerTest`, `…EdgeCaseTest`, `…DltTest` | success → ack; permanent → DLT immediately; transient → retries → DLT |
| Settlement | `SettlementServiceTest`, `…EdgeCaseTest`, `SettlementFullSellTest`, `ExecutionServiceTest` | cash math, average cost, full-sell deletion, duplicate delivery, optimistic lock retries, re-verification |
| Kafka plumbing | `KafkaProducerTest`, `DeadLetterPublisherTest`, `RetryHandlerTest`, `KafkaConsumerConfigTest`, `KafkaModelsTest`, `TradeEventSerializationTest` | envelopes, keys, topics, backoff math, (de)serialisation |
| Poller | `QuotePollerServiceTest`, `…EdgeCaseTest`, `QuotePollerWatchlistUnionTest` | symbol discovery and dedup, batching, interval floor, failures |
| Client/config | `FauxnanceClientTest`, `KafkaConfigTest`, `TradeExecutorConfigTest` | URL building, API key header, retries |

Because `FillRule` is a pure function, its tests need no mocks at all. The full journey (place → fill → blotter
shows Filled, polling while NEW) is tested by the frontend's Playwright `place-order` and `blotter` specs.

---

## Part 11: Commands cheat sheet

```bash
# 1. Install the shared library
cd Application/Services/shared-libs/domain-engine && mvn clean install -DskipTests

# 2. Run the executor (needs Kafka, PostgreSQL and Fauxnance credentials)
cd Application/Services/executor-service
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
export DB_URL=jdbc:postgresql://localhost:5432/trading_system DB_USERNAME=postgres DB_PASSWORD=...
export FAUXNANCE_BASE_URL=https://... FAUXNANCE_API_KEY=...
export POLL_INTERVAL_SECONDS=44000      # milliseconds, despite the name
mvn spring-boot:run
mvn test

# Docker (build context = Application/Services)
docker build -f executor-service/Dockerfile -t trade-executor Application/Services

# Kafka topics (orders, trade-events, market-data, user-registrations + .DLT)
Application/Infrastructure/Kafka/scripts/create-topics.sh
```

---

## Part 12: Known issues, risks and technical debt

1. **Orders can be stuck at `NEW` forever.** `PRICING_UNAVAILABLE` and `INSTRUMENT_NOT_TRADABLE` results are only
   logged; the message is acknowledged and the order is never retried, rejected or dead-lettered. The contract
   even defines a `QUOTE_UNAVAILABLE` reason. Treating a missing quote as a transient failure (retry → DLT), or
   rejecting with that reason, would close the gap.
2. **Duplicate deliveries still publish a trade event.** `settleFilled`/`settleRejected` return early on 0 rows,
   but `settleOrder` then calls `publishTradeEvent` anyway. The class comment says no event is published. A
   redelivered order emits a second `ORDER_FILLED`.
3. **Events are published inside the transaction, not after it.** The comment says "after commit", but
   `publishTradeEvent` runs inside `@Transactional`. If the commit then fails, consumers have already seen an event
   for a change that didn't happen. An after-commit hook or outbox fixes this. (Nothing consumes `trade-events` yet,
   so the impact is latent.)
4. **The trade event doesn't match the contract.** It carries only `orderId, accountId, status, executionPrice,
   reason`, while the `TradeEventPayload` contract requires `symbol, side, quantity, price, cashDelta,
   positionQuantityAfter, averageCostAfter, executedOn`.
5. **DLT messages lose their reason.** `DeadLetterPublisher` builds a `Message` with a `failure-reason` header but
   then sends only the raw bytes without it. It also re-serialises the deserialised envelope rather than
   forwarding the original record bytes.
6. **Malformed JSON may never reach the DLT.** The consumer's `JsonDeserializer` isn't wrapped in Spring's
   `ErrorHandlingDeserializer`, so a record that can't be deserialised fails inside the Kafka poll, before the
   listener and its DLT logic run.
7. **Poll interval confusion.**
   - The environment variable is called `POLL_INTERVAL_SECONDS` but holds **milliseconds**.
   - The 30-second floor is enforced only in the constructor's log; `@Scheduled` uses the raw property, so a
     smaller value still polls faster.
   - The defaults disagree (30000 in the YAML/constructor vs 120000 in the annotation).
   - The default 30 s with 8+ symbols exceeds the 2000/day quota by the code's own table.
8. **Config mismatches.**
   - `mybatis:` is nested under `spring:` in `application.yml` (it should be top-level), so
     `map-underscore-to-camel-case` is probably not applied (mappers use explicit mappings, so it's mostly
     harmless).
   - The Dockerfile `EXPOSE 8080` but the app listens on 8081.
   - The Fauxnance retry default is 3 in code but 1 in the YAML.
   - The `FauxnanceClient` URL default `http://localhost:8080` is the Trade API's port.
   - The group id `trade-executor-group` differs from the contract's `trade-executor`.
9. **Weak defaults and id generation.** The datasource defaults to `postgres/postgres`. Position ids use
   `MAX(id)+1` (races under concurrency); holding ids use `System.nanoTime()` (unlikely to clash but not
   guaranteed).
10. **Shared database coupling.** The executor writes tables owned by the Trade API (`orders`, `trading_accounts`)
    and reads `auth.users`. Several queries rely on `search_path` instead of schema-qualified names.
11. **The SELL re-check uses positions while placement uses holdings.** The two are kept in step for DELIVERY
    orders, but they're separate tables that could drift.
12. **Dead or placeholder code:** `model/Account`, `Order`, `Position`, `Quote` (empty TODOs), `entity/Position`,
    `kafka/EventEnvelope`, the `positionMapper` field in places; `LOGGING_GUIDE.md` is empty; `README.md` points at
    sprint 7 paths.
13. **Blocking retries.** `Thread.sleep` in the consumer and the Fauxnance client blocks the only listener thread.
    That's fine at current volume, but it delays every other account on the partition during backoff.

---

## Part 13: Review questions and answers

**Role and design**

1. **What does the executor do?**
   It consumes `ORDER_PLACED` events, fetches a live quote, decides fill or reject, settles the result in the DB,
   and publishes a trade event. Separately, it polls live prices and publishes them to `market-data`.

2. **Why is execution asynchronous?**
   It depends on an external quote API that can be slow or down. Decoupling lets the Trade API answer immediately,
   keeps orders queued durably in Kafka, and lets the executor retry and scale independently.

3. **Why does it reload the order from the DB instead of trusting the event?**
   The DB is the source of truth (status may have changed, e.g. cancelled), and it avoids acting on tampered or
   stale event data.

4. **Explain the fill rule.**
   BUY fills at the ask if `limit ≥ ask`; SELL fills at the bid if `limit ≤ bid`; otherwise reject. The trader gets
   the market price, which is at least as good as their limit.

5. **Why is `FillRule` a pure function?**
   Deterministic, side-effect-free logic is trivial to test and reason about, and it can be swapped (IOC/FOK)
   without touching I/O code.

6. **What happens if the quote has no bid/ask?**
   It falls back to the last price for both; if that's missing too, the result is `PRICING_UNAVAILABLE`.

**Correctness and money**

7. **What gets updated when an order fills?**
   In one transaction: order status, price and time; account cash (with optimistic lock); holding and position
   (with weighted average cost); then a trade event.

8. **How do you prevent double-filling on redelivery?**
   `UPDATE … WHERE order_id=? AND status='NEW'`; the second attempt updates 0 rows and stops before touching cash
   or positions.

9. **What is optimistic locking and why use it here?**
   A version check on the account row so concurrent updates (another fill, a deposit) can't overwrite each other.
   On conflict it re-reads and retries a few times.

10. **Why re-verify at execution time?**
    Placement doesn't reserve funds or holdings, and time passes; the account might be suspended, cash spent, or
    shares already sold. Re-checking prevents negative balances and overselling.

11. **How is average cost handled on a sell?**
    It's unchanged; only the quantity drops. That keeps the cost basis needed for realised P&L.

12. **Why `BigDecimal`?**
    Binary floating point can't represent most decimal amounts exactly; `BigDecimal` with explicit scale and
    rounding gives exact cents.

**Kafka and reliability**

13. **What delivery guarantee do you provide?**
    At-least-once delivery with idempotent processing, which is effectively-once for state changes.

14. **Why manual acknowledgment?**
    So the offset is committed only after the order is fully processed (or dead-lettered); a crash means
    redelivery, not loss.

15. **Transient vs permanent failures?**
    Permanent (bad message, missing order or instrument) is dead-lettered immediately; transient (DB/network) is
    retried with exponential backoff, then dead-lettered.

16. **Why a dead-letter topic?**
    So one bad message doesn't block the partition and stall every other account keyed to it, while keeping the
    message for investigation and replay.

17. **Why key `orders` by accountId and `market-data` by symbol?**
    Kafka orders within a partition only. Per-account order sequence matters for cash and positions; per-symbol
    order matters so an older quote never overwrites a newer one.

18. **Why concurrency 1?**
    Simple, strictly ordered processing; scaling out would mean more instances in the same group (up to the
    3 partitions).

**Market data**

19. **How does the poller pick symbols?**
    The distinct union of symbols in open positions and in any watchlist, so each symbol is fetched once per cycle.

20. **How do you stay within the API quota?**
    Batch up to 25 symbols per call and choose an interval so `86400 / interval × ceil(symbols/25) ≤ 2000`.

21. **Why does the poller live in the backend rather than the browser?**
    The Fauxnance API key must never ship to the browser, and one poller serving everyone uses far fewer requests
    than each browser polling.

**Quality**

22. **Biggest issues you'd fix?**
    Orders stuck at NEW when there's no quote, duplicate trade events on redelivery, publishing inside the
    transaction, DLT messages without their reason header, and the poll-interval floor not actually being enforced.

---

## Part 14: Glossary

| Term | Meaning |
|---|---|
| **Topic / partition / offset** | named stream / ordered shard of it / position in a shard |
| **Consumer group** | named consumer; partitions are split among its instances |
| **Manual ack** | commit the offset only when code says processing is done |
| **At-least-once** | every message is processed one or more times |
| **Idempotent consumer** | processing a message twice has the same effect as once |
| **DLT** | dead-letter topic for messages that can't be processed |
| **Exponential backoff** | wait 100 ms, 200 ms, 400 ms… between retries |
| **Poison pill** | a message that always fails and would block a partition |
| **Bid / ask / spread** | best buy price / best sell price / their difference |
| **Fill** | execution of an order at a price |
| **Settlement** | recording a fill's effects on cash and holdings |
| **Optimistic locking** | detect concurrent updates with a version column |
| **Weighted average cost** | average purchase price across buys |
| **Fauxnance** | the external market-data API used by this platform |
| **Pure function** | output depends only on inputs; no side effects |
