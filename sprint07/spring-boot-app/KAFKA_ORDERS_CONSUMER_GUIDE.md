# Kafka Orders Topic - Consumer Guide

## Connection Details

**Topic Name:** `orders`

**Bootstrap Servers:** Configured via environment variable `KAFKA_BOOTSTRAP_SERVERS`

**Key Type:** `String` (accountId as string)

---

## Producer Configuration (Reference)

The producer in the Spring Boot app uses these settings:
- **Producer ACKs:** `all` (waits for all in-sync replicas)
- **Idempotence:** Enabled
- **Retries:** 10
- **Max In-Flight Requests:** 5 per connection
- **Serializer:** `JsonSerializer` (Spring Kafka's JsonSerializer)

---

## Message Format

All messages follow a **standard envelope pattern** with topic-specific payloads.

### Envelope Structure: `KafkaMessageEnvelope<OrderPlacedPayload>`

```json
{
  "eventId": "string (UUID)",
  "eventType": "ORDER_PLACED",
  "eventTime": "string (ISO-8601 instant)",
  "source": "trade-api",
  "schemaVersion": 1,
  "payload": { ... }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventId` | String | Yes | Unique identifier (UUID) for this event |
| `eventType` | String | Yes | Always `"ORDER_PLACED"` for orders topic |
| `eventTime` | String | Yes | ISO-8601 timestamp when order was created |
| `source` | String | Yes | Always `"trade-api"` |
| `schemaVersion` | Integer | Yes | Schema version (currently `1`) |
| `payload` | OrderPlacedPayload | Yes | The actual order details |

---

## Payload Structure: `OrderPlacedPayload`

```json
{
  "orderId": "string",
  "accountId": 12345,
  "symbol": "string (e.g., 'AAPL')",
  "side": "BUY|SELL",
  "quantity": 100,
  "price": "123.45",
  "idempotencyKey": "string (UUID)",
  "createdOn": "string (ISO-8601 instant)"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderId` | String | Yes | Unique order identifier |
| `accountId` | Long | Yes | Trading account ID |
| `symbol` | String | Yes | Instrument/Stock symbol |
| `side` | String | Yes | Order direction: `"BUY"` or `"SELL"` |
| `quantity` | Integer | Yes | Number of shares (must be positive) |
| `price` | BigDecimal | Yes | Limit price per share (must be positive) |
| `idempotencyKey` | String | Yes | Idempotency key for duplicate detection |
| `createdOn` | String | Yes | ISO-8601 timestamp of order creation |

---

## Example Message

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "ORDER_PLACED",
  "eventTime": "2026-09-17T10:30:45.123Z",
  "source": "trade-api",
  "schemaVersion": 1,
  "payload": {
    "orderId": "5001",
    "accountId": 12345,
    "symbol": "AAPL",
    "side": "BUY",
    "quantity": 100,
    "price": 150.25,
    "idempotencyKey": "660e8400-e29b-41d4-a716-446655440001",
    "createdOn": "2026-09-17T10:30:45.123Z"
  }
}
```

---

## Consumer Deserialization

When implementing your consumer, follow these guidelines:

1. **Deserialize to:** `KafkaMessageEnvelope<OrderPlacedPayload>`
2. **Use JSON deserialization** with `@JsonIgnoreProperties(ignoreUnknown = true)` to handle forward compatibility
3. **Message Key:** Partition key is the `accountId` (ensures per-account ordering)
4. **Retention:** Messages retained for 7 days

### Spring Kafka Consumer Example:

```java
@KafkaListener(topics = "orders", groupId = "order-executor")
public void consumeOrderPlaced(
    @Payload KafkaMessageEnvelope<OrderPlacedPayload> event
) {
    OrderPlacedPayload order = event.payload();
    // Process order...
}
```

### Jackson Configuration:

```java
ObjectMapper mapper = new ObjectMapper();
mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

KafkaMessageEnvelope<OrderPlacedPayload> event = 
    mapper.readValue(jsonString, new TypeReference<>() {});
```

---

## Important Notes

- **Forward Compatibility:** The producer may add new fields in future schema versions. Consumers must ignore unknown fields.
- **Idempotency:** The `idempotencyKey` should be used by consumers to detect and ignore duplicate messages.
- **Ordering:** Messages for the same `accountId` are ordered; use single-threaded consumption per partition for strict ordering.
- **Schema Version:** Currently at version 1; check `schemaVersion` field for future schema evolution.
