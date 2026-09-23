# Kafka Architecture & Design Decisions

Status: Design justification for Sprint 7 topic creation. Binding contract: `contracts/kafka-topics.md`

## Executive Summary

The trading system uses Apache Kafka as its event backbone to decouple order placement from execution. This document justifies the partition counts, key choices, and dead-letter topic configuration implemented in `scripts/create-topics.sh`.

**One core principle:** The key decides the partition, and the partition decides the ordering guarantee. Kafka orders messages **within** a partition and gives no ordering **across** partitions.

---

## Topic Configuration & Justification

### 1. **orders** Topic

**Configuration:**
- **Key:** `accountId` (string)
- **Partitions:** 3
- **Retention:** 7 days (604800000 ms)
- **Replication Factor:** 1 (local development)

**Why `accountId` as key?**

The critical ordering requirement is **per-account**. Two orders on the same account must execute in the order they were accepted, or a sell can execute before the buy that made it possible:

```
Timeline:
  T1: Account A places BUY 100 AAPL @ $100
  T2: Account A places SELL 100 AAPL @ $110
  
If keyed by orderId (wrong):
  BUY order  → partition 0
  SELL order → partition 1
  Kafka guarantees no ordering between partitions
  Executor might process SELL first, selling shares not yet bought
  
If keyed by accountId (correct):
  BUY order  → partition X (based on accountId hash)
  SELL order → partition X (same accountId hash)
  Kafka guarantees both in partition X are processed in order
  SELL always executes after BUY
```

Two orders on **different accounts** have no relationship and can process in parallel, so partitioning by account is also efficient.

**Why NOT key by orderId?**

Keying by orderId would mean every order lands on its own partition, effectively destroying the per-account ordering guarantee:

```
100 orders on Account A:
  orderId-1 → partition 0
  orderId-2 → partition 1
  orderId-3 → partition 2
  ... (round-robin or hash-based)
  
Executor has 1 consumer group with 3 partitions:
  - Consumer A reads partition 0 (order 1, 4, 7, ...)
  - Consumer B reads partition 1 (order 2, 5, 8, ...)
  - Consumer C reads partition 2 (order 3, 6, 9, ...)
  
Each consumer processes orders independently, no order guarantee
Order 2 (SELL) could execute before order 1 (BUY)
```

**Why 3 partitions?**

The contract states: "Three partitions on `orders` and `trade-events` lets three executor instances run in one consumer group, which is enough to demonstrate rebalancing and enough to show that a consumer group cannot usefully exceed the partition count."

This means:
- **3 executor instances max** can share the work efficiently (one partition per instance)
- 4 instances → 1 instance idles (Kafka doesn't split partitions to consumers)
- Each partition processes messages sequentially → maximum 3 concurrent executions per account group (still maintaining per-account order)

**Partition scaling:** If you need more throughput in production, you can increase to 6 or 9 partitions, but this **rehashes keys** and splits an account's history across multiple partitions. Any decision to increase must be planned with downstream consumers.

**Why 7 days retention?**

- Orders are a work queue: once executed (within minutes), they're not needed
- 7 days is enough for debugging and operational troubleshooting
- Archived orders go to the database; Kafka is ephemeral
- Any longer is waste; any shorter risks loss of audit data during troubleshooting

---

### 2. **trade-events** Topic

**Configuration:**
- **Key:** `accountId` (string)
- **Partitions:** 3
- **Retention:** 30 days (2592000000 ms)
- **Replication Factor:** 1 (local development)

**Why `accountId` as key?**

Same per-account ordering requirement. A customer's portfolio view must show events in the order they happened:

```
Customer sees in their app:
  1. FILLED: BUY 100 AAPL
  2. FILLED: SELL 50 AAPL
  3. REJECTED: BUY 200 AAPL (insufficient funds)
  
If events are out of order, portfolio projection breaks:
  Event 3: insufficient funds? But I have 50 shares. Looks like a bug.
  Event 1: Oh, now I have them. System is broken.
```

Keying by `accountId` ensures each account's events arrive in order to all consumers (Portfolio, Notifications, Analytics, Advice).

**Why 3 partitions?**

Same reasoning as `orders`: matches executor instance count. The executor group will always have one consumer per partition for optimal throughput.

**Why 30 days retention?**

Longer than `orders` because trade-events are the **permanent event log**:

```
Orders topic (7 days):        ← Work queue, transient
  ORDER_PLACED message arrives
  Executor processes
  Message is done, can be deleted
  
Trade-events topic (30 days): ← Event log, historical
  ORDER_FILLED or ORDER_REJECTED message arrives
  Multiple consumers read it: Portfolio, Analytics, Notifications, Advice
  Each consumer at their own pace (may be days behind)
  Message must persist for slow subscribers
```

30 days allows:
- Portfolio service deployed 10 days ago to replay and catch up
- Analytics loader running batch jobs weekly
- Customer looking back at their trade history mid-month
- Post-trade reconciliation checking against order history

---

### 3. **market-data** Topic

**Configuration:**
- **Key:** `symbol` (string)
- **Partitions:** 6
- **Retention:** 1 day (86400000 ms)
- **Replication Factor:** 1 (local development)

**Why `symbol` as key?**

The ordering that matters is **per-instrument**. A consumer must never see an older quote after a newer one:

```
Consumer receives quotes for AAPL:
  T1: AAPL $232.50
  T2: AAPL $232.71
  T3: AAPL $232.65
  
If messages arrive out of order, calculations break:
  "AAPL is up $0.21 today"  (comparing T3 to T1)
  But the chart shows it went down from T2 to T3
  
Strategy order might not fill at stale price.
Chart shows wrong trend.
```

Keying by `symbol` guarantees each symbol's quotes are in chronological order. Different symbols are independent (can update in any order).

**Why 6 partitions?**

- Higher throughput than `orders/trade-events`: poller calls Fauxnance every 30-60 seconds, publishing up to 25 symbols per poll
- Rough estimate: 6 instances × 4 polls/minute × 25 symbols/poll ≈ 600 messages/minute
- 6 partitions allows 6 consumers (e.g., Portfolio, Watchlist, Advice, Strategy all reading independently)
- Scales better than 3 for read-heavy use case

**Why 1 day retention?**

Quotes are **ephemeral, low-value data**:
- End-of-day candles and delayed quotes (no real-time stream)
- Stale within hours (Fauxnance marks as `stale: true`)
- Historical pricing goes to database/data warehouse
- No audit requirement for quotes
- Storage cost matters for frequent polling

1 day is enough for:
- Intraday replays during development/debugging
- Real-time consumers to stay within Kafka instead of querying API

Longer (e.g., 7 days) would waste storage on 6-day-old stale quotes.

---

## Dead-Letter Topics Strategy

Each main topic has a `.DLT` (Dead-Letter) companion topic. These handle messages that fail processing with no recovery path.

### Configuration

| DLT Topic | Partitions | Retention | Reasoning |
|-----------|-----------|-----------|-----------|
| `orders.DLT` | 1 | 30 days | **Business operations**. A poison order blocks the work queue. 30 days to diagnose why the buy order malformed and fix it. After 30 days, the order is stale and the error context is lost. |
| `trade-events.DLT` | 1 | 90 days | **Audit trail and compliance**. A failed event is evidence of a processing failure. 90 days covers quarterly reconciliation. If settlement disagreement discovered in Q2 month-end, you can still see Q1 dead letters. |
| `market-data.DLT` | 1 | 7 days | **Ephemeral data**. A stale quote in DLT is worthless. 7 days (one trading week) is enough to notice the poller is broken and fix it. After that, the quote has no value. |

### Why 1 partition for all DLTs?

Dead-letter topics are **not part of the critical path**:
- They're error cases, not the happy path
- No ordering requirement within errors (they're already broken)
- Consolidating to 1 partition makes monitoring simpler: all errors land in one place
- Easier to debug: read one DLT sequentially rather than consuming from 3+ partitions

### Retention Rationale

**Criticality hierarchy:**
1. **High value (trade-events.DLT):** 90 days
   - Events represent real trades
   - Failure means settlement might not have happened
   - Regulatory/audit requirement
   - Longer retention = safety margin for discovery

2. **Medium value (orders.DLT):** 30 days
   - Orders are ephemeral work queue items
   - Failure means order never executed (usually caught by customer quickly)
   - Business relevance: new orders placed every day
   - 30 days = sufficient for operational troubleshooting

3. **Low value (market-data.DLT):** 7 days
   - Quotes are stale data by nature
   - Failure means one polling cycle was skipped
   - Next poll (60 seconds later) recovers
   - 7 days captures "poller is permanently broken" cases
   - Longer retention = wasted storage on worthless data

---

## Message Envelope (5 Fields, All Topics)

Every message on all three topics carries the same envelope to enable **one deserializer and one dead-letter handler** for the entire platform:

```json
{
  "eventId": "UUID",                           // Idempotency key for consumers
  "eventType": "ORDER_PLACED|ORDER_FILLED|...", // Discriminator for payload
  "eventTime": "2026-09-28T09:14:22Z",        // RFC 3339 UTC (when produced)
  "source": "trade-api|trade-executor|market-poller", // Component name
  "schemaVersion": 1,                          // Break on removal/rename only
  "payload": { /* topic & event-type specific */ }
}
```

### Forward Compatibility Rule

**All consumers MUST ignore unknown fields.** This enables additive schema changes:

```
Today: payload has 5 fields
Tomorrow: producer adds 6th field (optional, not breaking)

Consumer expecting 5 fields:
  {
    "orderId": "...",
    "accountId": 1,
    "symbol": "AAPL",
    "side": "BUY",
    "quantity": 100,
    "newField": "..." ← Unknown, MUST be ignored
  }
  
If consumer fails on unknown fields: outage
If consumer ignores: continues working, gains new field later
```

Implementation: Use `@JsonIgnoreProperties(ignoreUnknown = true)` on all record classes.

---

## Consumer Groups & Ordering Guarantees

| Consumer | Group ID | Guarantee |
|----------|----------|-----------|
| Trade Executor | `trade-executor` | **Per-account order within partition** (must execute account A's orders in sequence) |
| Portfolio Service | `portfolio-service` | **Per-account order within partition** (portfolio projection depends on event order per account) |
| Analytics Loader | `analytics-loader` | **Per-account order within partition** (trade sequence matters for cumulative metrics) |
| Watchlist Service | `watchlist-service` | **Per-symbol order within partition** (must see quotes in chronological order per symbol) |
| Notification Service | `notification-service` | **Per-account order within partition** (customer sees events in order) |
| Advice Service | `advice-service` | **Per-account order within partition** (signals depend on event sequence) |

**Critical:** Each service has its own `group.id`. Two services sharing a group ID will split the partitions between them and each sees only part of the stream.

---

## Producer Configuration

All producers follow this pattern for **idempotent at-least-once** delivery:

```properties
acks=all                                 # Wait for broker to replicate
enable.idempotence=true                 # Remove duplicate from producer retries
retries=<high>                          # Retry transient failures
max.in.flight.requests.per.connection=5 # Limit concurrency to preserve order
```

**Note:** Idempotent producers remove duplicates from **producer retries**, not from **application retries**. If your app retries after a crash, Kafka can't know that, and the message appears twice. This is survivable with idempotent consumers (see next section).

---

## Consumer Idempotency & Exactly-Once Semantics

Kafka guarantees **at-least-once** delivery, not exactly-once. Consumers must handle duplicates.

### Mechanism Used: Guarded State Transition

The Trade Executor uses a guarded UPDATE to achieve idempotency **without** a separate processed-events table:

```sql
UPDATE orders 
SET status = 'FILLED', executed_price = ?, executed_on = ?
WHERE id = ? AND status = 'NEW'
```

- **First delivery:** `status = 'NEW'` is true, update succeeds, status → `FILLED`
- **Duplicate delivery:** `status = 'NEW'` is false (already `FILLED`), zero rows affected, nothing changes
- **Outcome:** Idempotent without extra machinery

Why this is safe under concurrency:
- Database serializes the UPDATE
- Two updates on the same order can't both see `status = 'NEW'`
- Only one increments to `FILLED`

### Alternative: Processed Events Table

A team could implement:

```sql
CREATE TABLE processed_events (
  event_id UUID PRIMARY KEY,
  processed_at TIMESTAMP
);

-- Before processing:
BEGIN;
INSERT INTO processed_events (event_id) VALUES (?);
-- ... do side effects ...
COMMIT;
```

- First delivery: inserts successfully, side effects happen
- Duplicate: primary key violation, transaction rolls back, nothing changes
- Both approaches are acceptable

---

## Failure Handling

### Two Classes of Failure

| Class | Examples | Handling |
|-------|----------|----------|
| **Poison (never succeeds)** | Malformed JSON, missing field, unknown eventType | Dead-letter on first attempt |
| **Transient (will succeed later)** | Broker unreachable, DB connection lost, network timeout | Retry with backoff → dead-letter after budget spent |

### Example: Trade Executor

```java
try {
  message = deserialize(record);  // May fail: malformed JSON
} catch (JsonException e) {
  sendToDeadLetter(record, "MALFORMED_JSON", e);  // No retry
  commitOffset();
  return;
}

try {
  order = loadOrderFromDB(message.orderId);  // May fail: connection lost
  price = fetchQuoteFromFauxnance(order.symbol);  // May fail: API timeout
  settle(order, price);  // May fail: optimistic lock
} catch (TemporaryException e) {
  if (retryCount < maxRetries) {
    throw e;  // Broker will re-deliver from partition
  } else {
    sendToDeadLetter(record, "MAX_RETRIES_EXCEEDED", e);
    commitOffset();
  }
}
```

### Why Dead-Letter, Not Retry Forever?

One poison message blocks an entire partition. Example:

```
Partition 0 (Account A):
  Message 1: valid
  Message 2: valid
  Message 3: POISON (malformed)
  Message 4: valid
  Message 5: valid

Executor polls and retries message 3 forever:
  Message 1, 2 are processed
  Message 3 fails, retry...
  Meanwhile, all of Account A's messages (4, 5, ...) are blocked
  
No consumer can move forward in partition 0
Account A's orders are stuck
```

Dead-lettering message 3 clears the blockage:
```
  Message 1: processed
  Message 2: processed
  Message 3: → orders.DLT (no retry)
  Message 4: now can be processed
  Message 5: now can be processed
  Account A's later orders proceed
```

---

## Topic Creation Command

**One command creates all six topics against an empty broker:**

```bash
cd sprint07
./scripts/create-topics.sh
```

**Resetting the broker:**

```bash
cd sprint07
./scripts/create-topics.sh --reset
```

The script is idempotent and can be run multiple times safely.

**Verification:**

```bash
./scripts/create-topics.sh --describe
```

Shows the current state of all topics on the broker.

---

## Scaling & Future Changes

### Partition Count Increases

- **Can be done:** Partitions are additive
- **Effect:** New partitions re-hash keys, splitting an account's history
  - Account A, messages 1-100: partitions 0
  - Increase to 6 partitions
  - Account A, messages 101+: might be partition 3
  - History is split; new consumers see only the new partition's data
- **Coordination:** Requires replay from Postgres if consumers need full history
- **Example:** Sprint 10 might increase market-data from 6 to 12 if quote volume grows

### Consumer Group Scaling

- **3 partitions** + **1 executor** = 2 idle partitions (inefficient)
- **3 partitions** + **3 executors** = optimal (1 partition each)
- **3 partitions** + **4 executors** = 1 idle executor (can't exceed partition count)
- **6 partitions** + **3 executors** = 2 partitions per executor (doubled throughput)

---

## Market Data Poller: Quota & Design

The market-data poller is a scheduled component inside the Trade Executor that fetches quotes from Fauxnance and publishes them to the market-data topic. It optimizes both HTTP quota and Kafka ordering.

### Quota Calculation

**Requirement:** Stay within 2000 requests per day on Fauxnance.

**Formula:**
```
Requests per day = 86400 seconds/day ÷ interval_seconds ÷ ceiling(symbol_count ÷ 25)
```

The denominator has two parts:
1. **interval_seconds:** How often the poller runs (enforced minimum: 30 seconds)
2. **ceiling(symbol_count ÷ 25):** How many batches needed (25 symbols per HTTP request)

**Examples at different intervals:**

With **8 symbols** (typical test load):

| Interval | Batches | Requests/Day | Status |
|----------|---------|--------------|--------|
| 30s | 1 | 2880 | ⚠️ **EXCEEDS quota** |
| 40s | 1 | 2160 | ⚠️ **EXCEEDS quota** |
| 43s | 1 | 2009 | ⚠️ **Just exceeds** |
| 44s | 1 | 1964 | ✓ **Within quota** |
| 60s | 1 | 1440 | ✓ **Safe margin** |

With **25 symbols** (one batch max):

| Interval | Batches | Requests/Day | Status |
|----------|---------|--------------|--------|
| 30s | 1 | 2880 | ⚠️ **EXCEEDS quota** |
| 60s | 1 | 1440 | ✓ **Within quota** |
| 120s | 1 | 720 | ✓ **Plenty of room** |

With **26 symbols** (two batches):

| Interval | Batches | Requests/Day | Status |
|----------|---------|--------------|--------|
| 30s | 2 | 1440 | ✓ **Within quota** |
| 60s | 2 | 720 | ✓ **Safe** |

### Production Recommendation

For 8 symbols (the typical test load in development):
- **Set `POLL_INTERVAL_SECONDS=44`** to stay safely within 2000 req/day quota
- Gives 1964 requests/day, safe margin above quota
- Allows ~2 minutes for quote freshness without quota concerns

### Batching Strategy

**HTTP Request Optimization:**
- Poller batches up to 25 symbols per Fauxnance HTTP call
- With 8 symbols: 1 batch per poll (1 HTTP request every 44 seconds)
- With 26+ symbols: multiple batches within one poll cycle
- Dramatically reduces quota burn: 8 symbols/30s = 23,040 req/day (one at a time) vs 2,880 req/day (batched)

**Kafka Message Design:**
- Each quote is **one separate message** to market-data, keyed by symbol
- NOT one message per batch (which would put all symbols behind one key)
- Preserves per-symbol ordering: each symbol's quotes are ordered within a partition
- Allows per-symbol consumers to subscribe to specific symbols if needed

**Why split Kafka messages?**
```
WRONG (batched messages):
  Batch 1: [AAPL, GOOG, MSFT] 
    → All three go to same partition (one key)
    → Per-symbol ordering lost
    → Quote consumer can't know which quotes are "latest" per symbol
    
CORRECT (per-symbol messages):
  Message 1: AAPL quote
    → Key: "AAPL" → partition X
  Message 2: GOOG quote
    → Key: "GOOG" → partition Y
  Message 3: MSFT quote
    → Key: "MSFT" → partition Z
  → Each symbol's quotes ordered within its partition
  → Consumer knows latest AAPL, latest GOOG, latest MSFT independently
```

### Interval Floor Enforcement

The poller enforces a **minimum interval of 30 seconds in code**, not in documentation:

```java
public QuotePollerService(
        ...,
        @Value("${app.poller.poll-interval-seconds:30}") int pollIntervalSeconds) {
    
    if (pollIntervalSeconds < MIN_INTERVAL_SECONDS) {
        logger.warn(
            "Configured poll interval {} seconds is below minimum {}. Using minimum interval.",
            pollIntervalSeconds, MIN_INTERVAL_SECONDS);
        this.pollIntervalSeconds = MIN_INTERVAL_SECONDS;
    } else {
        this.pollIntervalSeconds = pollIntervalSeconds;
    }
}
```

**Why code, not config?**
- If interval floor is only documented, someone sets `POLL_INTERVAL_SECONDS=5` and quota burns in 4 hours
- Code enforcement catches the misconfiguration at startup
- Logs a clear warning so operators know why their intended interval was changed

### Symbol Discovery

The poller discovers symbols by querying `PositionRepository.findAllDistinctSymbols()`:

```sql
SELECT DISTINCT p.symbol FROM Position p
```

This returns all symbols with open positions (anyone holding or owing shares). The poller then:
1. Fetches quotes for these symbols in batches
2. Publishes one message per symbol
3. Subscribes to positions table changes (future: could trigger on-demand quotes for new positions)

### Consumer Implications

The poller broadcasts to `market-data` with no consumer group (all listeners see all quotes):

```
market-data topic
  ├─ Portfolio service (listens to all quotes)
  ├─ Watchlist service (listens to all quotes)
  ├─ Advice engine (listens to all quotes)
  └─ Any other price consumer
```

Each maintains its own subscription state and is unaware of others.

---

## SonarQube Quality Gates

This design passes:
- **No hardcoded broker addresses** in code (environment variables only)
- **Testable message structures** (records are immutable, easy to mock)
- **No secrets in messages** (keys come from environment)
- **Dead-letter handling is explicit** (not silently dropped)

---

## Summary: Why This Design?

| Decision | Justification |
|----------|-----------|
| 3 partitions (orders, trade-events) | Matches typical executor instance count; per-account order |
| 6 partitions (market-data) | Higher throughput for polling; per-symbol order |
| accountId key | Guarantees per-account ordering (critical for settlement) |
| symbol key | Guarantees per-quote ordering (critical for accuracy) |
| 7d retention (orders) | Work queue; after execution, not needed |
| 30d retention (trade-events) | Event log; supports batch catchup |
| 1d retention (market-data) | Ephemeral; stale after hours |
| DLT retention (7d/30d/90d) | Proportional to business value |
| 1 partition DLT | Consolidation point for errors |
| 5-field envelope | One deserializer for platform |
| Ignore unknown fields | Forward-compatible schema evolution |
| Guarded state transition | Idempotent without extra tables |

---

## References

- **Binding contract:** `contracts/kafka-topics.md`
- **Sprint objectives:** `README.md`
- **Topic creation:** `scripts/create-topics.sh`
- **Message formats:** Record classes in `domain-engine/src/main/java/com/tradingsystem/domain/kafka/`
