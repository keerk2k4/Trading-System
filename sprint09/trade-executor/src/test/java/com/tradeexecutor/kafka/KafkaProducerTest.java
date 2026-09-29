package com.tradeexecutor.kafka;

import com.tradeexecutor.model.TradeEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
@DisplayName("KafkaProducer event construction and failure handling")
@SuppressWarnings({"rawtypes", "unchecked"})
class KafkaProducerTest {

    @Mock
    private KafkaTemplate<String, KafkaMessageEnvelope<?>> kafkaTemplate;

    private KafkaProducer producer;

    @BeforeEach
    void setUp() {
        producer = new KafkaProducer(kafkaTemplate);
    }

    @Test
    @DisplayName("A valid quote is wrapped in a keyed market-data envelope")
    void publishQuoteBuildsEnvelope() {
        QuotePayload payload = quotePayload();

        producer.publishQuote("AAPL", payload);

        ArgumentCaptor<KafkaMessageEnvelope> envelopeCaptor = ArgumentCaptor.forClass(KafkaMessageEnvelope.class);
        verify(kafkaTemplate).send(eq("market-data"), eq("AAPL"), envelopeCaptor.capture());
        KafkaMessageEnvelope<?> envelope = envelopeCaptor.getValue();

        assertEquals("QUOTE", envelope.eventType());
        assertEquals("market-poller", envelope.source());
        assertEquals(1, envelope.schemaVersion());
        assertSame(payload, envelope.payload());
        assertNotNull(envelope.eventId());
        assertNotNull(Instant.parse(envelope.eventTime()));
    }

    @Test
    @DisplayName("Null, blank, and whitespace symbols are ignored without a Kafka send")
    void publishQuoteRejectsInvalidSymbols() {
        producer.publishQuote(null, quotePayload());
        producer.publishQuote("", quotePayload());
        producer.publishQuote("   ", quotePayload());

        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    @DisplayName("A missing quote payload is ignored without a Kafka send")
    void publishQuoteRejectsNullPayload() {
        producer.publishQuote("AAPL", null);

        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    @DisplayName("Quote publication errors are logged and do not escape the poller")
    void publishQuoteSwallowsSendFailure() {
        QuotePayload payload = quotePayload();
        doThrow(new IllegalStateException("broker unavailable")).when(kafkaTemplate)
                .send(eq("market-data"), eq("AAPL"), any(KafkaMessageEnvelope.class));

        assertDoesNotThrow(() -> producer.publishQuote("AAPL", payload));
    }

    @Test
    @DisplayName("FILLED trade events use the ORDER_FILLED event type")
    void publishFilledTradeEventUsesFilledType() {
        TradeEvent tradeEvent = tradeEvent("FILLED");

        producer.publishTradeEvent("202", tradeEvent);

        ArgumentCaptor<KafkaMessageEnvelope> envelopeCaptor = ArgumentCaptor.forClass(KafkaMessageEnvelope.class);
        verify(kafkaTemplate).send(eq("trade-events"), eq("202"), envelopeCaptor.capture());
        KafkaMessageEnvelope<?> envelope = envelopeCaptor.getValue();
        assertEquals("ORDER_FILLED", envelope.eventType());
        assertEquals("trade-executor", envelope.source());
        assertEquals(1, envelope.schemaVersion());
        assertSame(tradeEvent, envelope.payload());
    }

    @Test
    @DisplayName("REJECTED trade events use the ORDER_REJECTED event type")
    void publishRejectedTradeEventUsesRejectedType() {
        producer.publishTradeEvent("202", tradeEvent("REJECTED"));

        ArgumentCaptor<KafkaMessageEnvelope> envelopeCaptor = ArgumentCaptor.forClass(KafkaMessageEnvelope.class);
        verify(kafkaTemplate).send(eq("trade-events"), eq("202"), envelopeCaptor.capture());
        assertEquals("ORDER_REJECTED", envelopeCaptor.getValue().eventType());
    }

    @Test
    @DisplayName("Other trade statuses are prefixed with ORDER_")
    void publishOtherTradeEventUsesGenericType() {
        producer.publishTradeEvent("202", tradeEvent("CANCELLED"));

        ArgumentCaptor<KafkaMessageEnvelope> envelopeCaptor = ArgumentCaptor.forClass(KafkaMessageEnvelope.class);
        verify(kafkaTemplate).send(eq("trade-events"), eq("202"), envelopeCaptor.capture());
        assertEquals("ORDER_CANCELLED", envelopeCaptor.getValue().eventType());
    }

    @Test
    @DisplayName("Trade event keys must be present")
    void publishTradeEventRejectsInvalidAccountKeys() {
        TradeEvent tradeEvent = tradeEvent("FILLED");

        producer.publishTradeEvent(null, tradeEvent);
        producer.publishTradeEvent("", tradeEvent);
        producer.publishTradeEvent("  ", tradeEvent);

        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    @DisplayName("A missing trade event is ignored without a Kafka send")
    void publishTradeEventRejectsNullPayload() {
        producer.publishTradeEvent("202", null);

        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    @DisplayName("Trade publication failures are wrapped for settlement to handle")
    void publishTradeEventWrapsSendFailure() {
        TradeEvent tradeEvent = tradeEvent("FILLED");
        doThrow(new IllegalStateException("broker unavailable")).when(kafkaTemplate)
                .send(eq("trade-events"), eq("202"), any(KafkaMessageEnvelope.class));

        RuntimeException exception = assertThrows(
                RuntimeException.class,
                () -> producer.publishTradeEvent("202", tradeEvent)
        );

        assertEquals("Failed to publish trade event", exception.getMessage());
        assertEquals("broker unavailable", exception.getCause().getMessage());
    }

    private QuotePayload quotePayload() {
        return new QuotePayload(
                "AAPL",
                new BigDecimal("150.00"),
                new BigDecimal("149.99"),
                new BigDecimal("150.01"),
                "USD",
                new BigDecimal("1.00"),
                new BigDecimal("0.67"),
                new BigDecimal("149.00"),
                "open",
                false,
                "2024-01-15T10:00:00Z"
        );
    }

    private TradeEvent tradeEvent(String status) {
        return new TradeEvent(101L, 202L, status, new BigDecimal("150.00"), "reason");
    }
}
