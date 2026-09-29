package com.tradeexecutor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.KafkaMessageEnvelope;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import com.tradeexecutor.service.SettlementService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderPlacedConsumer unexpected failures and DLT safeguards")
class OrderPlacedConsumerEdgeCaseTest {

    @Mock
    private ExecutionService executionService;
    @Mock
    private SettlementService settlementService;
    @Mock
    private DeadLetterPublisher deadLetterPublisher;
    @Mock
    private RetryHandler retryHandler;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private Acknowledgment acknowledgment;

    private OrderPlacedConsumer consumer;
    private OrderPlacedEvent event;
    private KafkaMessageEnvelope<OrderPlacedEvent> envelope;
    private ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> record;

    @BeforeEach
    void setUp() {
        consumer = new OrderPlacedConsumer(
                executionService, settlementService, deadLetterPublisher, retryHandler, objectMapper
        );
        event = new OrderPlacedEvent();
        event.setOrderId("101");
        event.setAccountId(202L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(1);
        event.setPrice(new BigDecimal("100.00"));
        envelope = new KafkaMessageEnvelope<>(
                "event-101", "ORDER_PLACED", "2024-01-01T00:00:00Z", "trade-api", 1, event
        );
        record = new ConsumerRecord<>("orders", 0, 10L, "202", envelope);
    }

    @Test
    @DisplayName("Unexpected transient exceptions are retried and can recover")
    void unexpectedExceptionCanRecoverOnRetry() {
        when(retryHandler.getMaxRetries()).thenReturn(2);
        when(retryHandler.shouldRetry(1)).thenReturn(true);
        when(retryHandler.calculateBackoffMs(1)).thenReturn(0L);
        doThrow(new IllegalStateException("temporary failure"))
                .doNothing()
                .when(executionService).processOrderPlaced(event);

        consumer.onOrderPlaced(record, envelope, acknowledgment);

        verify(executionService, org.mockito.Mockito.times(2)).processOrderPlaced(event);
        verify(deadLetterPublisher, never()).publishToDeadLetter(anyString(), anyString(), any(byte[].class), anyString());
        verify(acknowledgment).acknowledge();
    }

    @Test
    @DisplayName("Unexpected exception retry exhaustion is sent to DLT with a transient reason")
    void unexpectedExceptionExhaustionIsDeadLettered() throws Exception {
        when(retryHandler.shouldRetry(1)).thenReturn(false);
        when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[]{1, 2, 3});
        doThrow(new IllegalArgumentException("unexpected")).when(executionService).processOrderPlaced(event);

        consumer.onOrderPlaced(record, envelope, acknowledgment);

        ArgumentCaptor<String> reasonCaptor = ArgumentCaptor.forClass(String.class);
        verify(deadLetterPublisher).publishToDeadLetter(
                eq("orders"), eq("202"), any(byte[].class), reasonCaptor.capture()
        );
        org.junit.jupiter.api.Assertions.assertTrue(reasonCaptor.getValue().startsWith("TRANSIENT:"));
        verify(acknowledgment).acknowledge();
    }

    @Test
    @DisplayName("A DLT serialization failure is contained but the failed message is still acknowledged")
    void permanentFailureSerializationFailureStillAcknowledges() throws Exception {
        when(objectMapper.writeValueAsBytes(any())).thenThrow(new IllegalStateException("serialization failed"));
        doThrow(new PermanentProcessingException("bad order"))
                .when(executionService).processOrderPlaced(event);

        assertDoesNotThrow(() -> consumer.onOrderPlaced(record, envelope, acknowledgment));

        verify(deadLetterPublisher, never()).publishToDeadLetter(anyString(), anyString(), any(byte[].class), anyString());
        verify(acknowledgment).acknowledge();
    }

    @Test
    @DisplayName("A successful message with no acknowledgment callback is processed safely")
    void successDoesNotRequireNonNullAcknowledgment() {
        doNothing().when(executionService).processOrderPlaced(event);

        assertDoesNotThrow(() -> consumer.onOrderPlaced(record, envelope, null));

        verify(executionService).processOrderPlaced(event);
        verify(deadLetterPublisher, never()).publishToDeadLetter(anyString(), anyString(), any(byte[].class), anyString());
    }

    @Test
    @DisplayName("A non-null envelope with a null payload is handled as a permanent message")
    void nullPayloadIsDeadLettered() throws Exception {
        KafkaMessageEnvelope<OrderPlacedEvent> emptyEnvelope = new KafkaMessageEnvelope<>(
                "event-empty", "ORDER_PLACED", "2024-01-01T00:00:00Z", "trade-api", 1, null
        );
        ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> emptyRecord =
                new ConsumerRecord<>("orders", 0, 11L, "203", emptyEnvelope);
        when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[]{4});

        consumer.onOrderPlaced(emptyRecord, emptyEnvelope, acknowledgment);

        verify(deadLetterPublisher).publishToDeadLetter(
                eq("orders"), eq("203"), any(byte[].class), eq("Null envelope or payload")
        );
        verify(acknowledgment).acknowledge();
    }
}
