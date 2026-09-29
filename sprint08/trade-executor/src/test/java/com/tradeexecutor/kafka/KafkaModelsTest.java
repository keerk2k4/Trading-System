package com.tradeexecutor.kafka;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DisplayName("Kafka envelope and payload model contracts")
class KafkaModelsTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("Envelope exposes all fields and known enum values")
    void envelopeExposesFieldsAndEnums() {
        KafkaMessageEnvelope<OrderPlacedEvent> envelope = new KafkaMessageEnvelope<>(
                "event-1", "ORDER_PLACED", "2024-01-01T00:00:00Z", "trade-api", 1, null
        );

        assertEquals("event-1", envelope.eventId());
        assertEquals("ORDER_PLACED", envelope.eventType());
        assertEquals("2024-01-01T00:00:00Z", envelope.eventTime());
        assertEquals("trade-api", envelope.source());
        assertEquals(1, envelope.schemaVersion());
        assertEquals("trade-api", KafkaMessageEnvelope.Source.TRADE_API.value);
        assertEquals("trade-executor", KafkaMessageEnvelope.Source.TRADE_EXECUTOR.value);
        assertEquals("market-poller", KafkaMessageEnvelope.Source.MARKET_POLLER.value);
        assertEquals("ORDER_PLACED", KafkaMessageEnvelope.OrderEventType.ORDER_PLACED.value);
        assertEquals("ORDER_FILLED", KafkaMessageEnvelope.TradeEventType.ORDER_FILLED.value);
        assertEquals("ORDER_REJECTED", KafkaMessageEnvelope.TradeEventType.ORDER_REJECTED.value);
        assertEquals("ORDER_CANCELLED", KafkaMessageEnvelope.TradeEventType.ORDER_CANCELLED.value);
        assertEquals("QUOTE", KafkaMessageEnvelope.MarketEventType.QUOTE.value);
    }

    @Test
    @DisplayName("Envelope rejects zero and negative schema versions")
    void envelopeRejectsNonPositiveSchemaVersion() {
        assertThrows(IllegalArgumentException.class, () -> new KafkaMessageEnvelope<>(
                "event-1", "ORDER_PLACED", "time", "source", 0, null
        ));
        assertThrows(IllegalArgumentException.class, () -> new KafkaMessageEnvelope<>(
                "event-1", "ORDER_PLACED", "time", "source", -1, null
        ));
    }

    @Test
    @DisplayName("Envelope deserialization ignores unknown envelope and payload properties")
    void envelopeJsonIsForwardCompatible() throws Exception {
        String json = """
                {
                  "eventId": "event-9",
                  "eventType": "ORDER_PLACED",
                  "eventTime": "2024-01-01T00:00:00Z",
                  "source": "trade-api",
                  "schemaVersion": 1,
                  "payload": {
                    "orderId": "42",
                    "accountId": 7,
                    "symbol": "AAPL",
                    "newField": "ignored"
                  },
                  "newEnvelopeField": true
                }
                """;

        KafkaMessageEnvelope<OrderPlacedEvent> envelope = objectMapper.readValue(
                json,
                new TypeReference<KafkaMessageEnvelope<OrderPlacedEvent>>() {}
        );

        assertEquals("event-9", envelope.eventId());
        assertEquals(1, envelope.schemaVersion());
        assertEquals("42", envelope.payload().getOrderId());
        assertEquals(7L, envelope.payload().getAccountId());
    }

    @Test
    @DisplayName("Quote payload round-trips nullable market fields and exposes market states")
    void quotePayloadRoundTrips() throws Exception {
        QuotePayload original = new QuotePayload(
                "MSFT", new BigDecimal("300.00"), new BigDecimal("299.99"), new BigDecimal("300.01"),
                "USD", null, null, null, "closed", true, "2024-01-01T00:00:00Z"
        );

        String json = objectMapper.writeValueAsString(original);
        QuotePayload decoded = objectMapper.readValue(json, QuotePayload.class);

        assertEquals(original.symbol(), decoded.symbol());
        assertEquals(original.price(), decoded.price());
        assertEquals(original.bid(), decoded.bid());
        assertEquals(original.ask(), decoded.ask());
        assertEquals(original.currency(), decoded.currency());
        assertEquals(original.marketState(), decoded.marketState());
        assertEquals(original.stale(), decoded.stale());
        assertEquals("open", QuotePayload.MarketState.OPEN.value);
        assertEquals("closed", QuotePayload.MarketState.CLOSED.value);
        assertEquals("pre", QuotePayload.MarketState.PRE.value);
        assertEquals("post", QuotePayload.MarketState.POST.value);
        assertEquals("unknown", QuotePayload.MarketState.UNKNOWN.value);
    }

    @Test
    @DisplayName("Legacy EventEnvelope supports setters, JSON binding, and unknown fields")
    void eventEnvelopeSupportsJsonAndSetters() throws Exception {
        EventEnvelope<OrderPlacedEvent> envelope = new EventEnvelope<>();
        envelope.setEventId("event-2");
        envelope.setEventType("ORDER_PLACED");
        envelope.setEventTime("2024-01-01T00:00:00Z");
        envelope.setSource("trade-api");
        envelope.setSchemaVersion(1);

        OrderPlacedEvent payload = new OrderPlacedEvent();
        payload.setOrderId("99");
        envelope.setPayload(payload);

        String json = objectMapper.writeValueAsString(envelope);
        EventEnvelope<OrderPlacedEvent> decoded = objectMapper.readValue(
                json,
                new TypeReference<EventEnvelope<OrderPlacedEvent>>() {}
        );

        assertEquals("event-2", decoded.getEventId());
        assertEquals("ORDER_PLACED", decoded.getEventType());
        assertEquals("2024-01-01T00:00:00Z", decoded.getEventTime());
        assertEquals("trade-api", decoded.getSource());
        assertEquals(1, decoded.getSchemaVersion());
        assertEquals("99", decoded.getPayload().getOrderId());
    }
}
