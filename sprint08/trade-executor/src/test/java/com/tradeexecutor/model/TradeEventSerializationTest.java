package com.tradeexecutor.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Trade and order event model serialization")
class TradeEventSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("TradeEvent constructor and setters preserve settlement data")
    void tradeEventAccessorsAndToStringPreserveData() {
        TradeEvent event = new TradeEvent(1L, 2L, "FILLED", new BigDecimal("10.25"), "filled at quote");

        assertEquals(1L, event.getOrderId());
        assertEquals(2L, event.getAccountId());
        assertEquals("FILLED", event.getStatus());
        assertEquals(new BigDecimal("10.25"), event.getExecutionPrice());
        assertEquals("filled at quote", event.getReason());
        assertTrue(event.toString().contains("orderId=1"));
        assertTrue(event.toString().contains("status='FILLED'"));

        event.setOrderId(3L);
        event.setAccountId(4L);
        event.setStatus("REJECTED");
        event.setExecutionPrice(null);
        event.setReason("outside limit");
        assertEquals(3L, event.getOrderId());
        assertEquals(4L, event.getAccountId());
        assertEquals("REJECTED", event.getStatus());
        assertEquals(null, event.getExecutionPrice());
        assertEquals("outside limit", event.getReason());
    }

    @Test
    @DisplayName("TradeEvent JSON ignores unknown fields")
    void tradeEventJsonIsForwardCompatible() throws Exception {
        String json = """
                {
                  "orderId": 10,
                  "accountId": 20,
                  "status": "REJECTED",
                  "executionPrice": null,
                  "reason": "no quote",
                  "futureField": "ignored"
                }
                """;

        TradeEvent event = objectMapper.readValue(json, TradeEvent.class);

        assertEquals(10L, event.getOrderId());
        assertEquals(20L, event.getAccountId());
        assertEquals("REJECTED", event.getStatus());
        assertEquals("no quote", event.getReason());
    }

    @Test
    @DisplayName("OrderPlacedEvent JSON round-trip retains order fields")
    void orderPlacedEventRoundTrips() throws Exception {
        OrderPlacedEvent original = new OrderPlacedEvent();
        original.setOrderId("123");
        original.setAccountId(456L);
        original.setSymbol("AAPL");
        original.setSide("BUY");
        original.setQuantity(10);
        original.setPrice(new BigDecimal("150.00"));
        original.setIdempotencyKey("idem-123");
        original.setCreatedOn("2024-01-01T00:00:00Z");

        OrderPlacedEvent decoded = objectMapper.readValue(
                objectMapper.writeValueAsString(original),
                OrderPlacedEvent.class
        );

        assertEquals("123", decoded.getOrderId());
        assertEquals(456L, decoded.getAccountId());
        assertEquals("AAPL", decoded.getSymbol());
        assertEquals("BUY", decoded.getSide());
        assertEquals(10, decoded.getQuantity());
        assertEquals(new BigDecimal("150.00"), decoded.getPrice());
        assertEquals("idem-123", decoded.getIdempotencyKey());
        assertEquals("2024-01-01T00:00:00Z", decoded.getCreatedOn());
    }
}
