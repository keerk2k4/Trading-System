package com.tradeexecutor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.EventEnvelope;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for OrderPlacedConsumer happy path plus ack / envelope handling.
 *
 * Error-handling retry scenarios live in OrderPlacedConsumerErrorHandlingTest.
 */
@DisplayName("OrderPlacedConsumer Happy Path Tests")
@ExtendWith(MockitoExtension.class)
class OrderPlacedConsumerTest {

    @Mock
    private ExecutionService executionService;

    @Mock
    private DeadLetterPublisher deadLetterPublisher;

    private RetryHandler retryHandler;

    private ObjectMapper objectMapper;

    @Mock
    private Acknowledgment acknowledgment;

    private OrderPlacedConsumer consumer;

    @BeforeEach
    void setUp() {
        retryHandler = new RetryHandler();
        ReflectionTestUtils.setField(retryHandler, "maxRetryAttempts", 3);
        ReflectionTestUtils.setField(retryHandler, "initialDelayMs", 100L);
        ReflectionTestUtils.setField(retryHandler, "maxDelayMs", 30000L);
        ReflectionTestUtils.setField(retryHandler, "backoffMultiplier", 2.0);
        objectMapper = new ObjectMapper();
        consumer = new OrderPlacedConsumer(
            executionService,
            deadLetterPublisher,
            retryHandler,
            objectMapper
        );
    }

    @Test
    @DisplayName("OnOrderPlaced: Valid raw event is passed to ExecutionService and acked")
    void testOnOrderPlacedPassesToExecutionService() throws Exception {
        // Given: A valid ORDER_PLACED event (raw payload form)
        OrderPlacedEvent event = validEvent("order-123");
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        ConsumerRecord<String, byte[]> record = record("account-1", messageBytes);

        // When: Consumer receives the event
        consumer.onOrderPlaced(record, acknowledgment);

        // Then: ExecutionService.processOrderPlaced was called once
        verify(executionService, times(1)).processOrderPlaced(any(OrderPlacedEvent.class));

        // And: Dead-letter publisher was not called (success case)
        verify(deadLetterPublisher, never()).publishToDeadLetter(
            anyString(), anyString(), any(), anyString(), any());

        // And: Kafka message is acknowledged
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: single-arg overload processes without ack")
    void testSingleArgOverloadProcessesWithoutAck() throws Exception {
        OrderPlacedEvent event = validEvent("order-123");
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);

        consumer.onOrderPlaced(record("account-1", messageBytes));

        verify(executionService, times(1)).processOrderPlaced(any(OrderPlacedEvent.class));
        verify(deadLetterPublisher, never()).publishToDeadLetter(
            anyString(), anyString(), any(), anyString(), any());
    }

    @Test
    @DisplayName("OnOrderPlaced: contract envelope is unwrapped to payload")
    void testEnvelopeIsUnwrapped() throws Exception {
        OrderPlacedEvent payload = validEvent("order-123");
        EventEnvelope<OrderPlacedEvent> envelope = new EventEnvelope<>();
        envelope.setEventId("eid-1");
        envelope.setEventType("ORDER_PLACED");
        envelope.setEventTime("2026-09-28T09:14:22Z");
        envelope.setSource("trade-api");
        envelope.setSchemaVersion(1);
        envelope.setPayload(payload);
        byte[] messageBytes = objectMapper.writeValueAsBytes(envelope);

        consumer.onOrderPlaced(record("1", messageBytes), acknowledgment);

        verify(executionService, times(1)).processOrderPlaced(any(OrderPlacedEvent.class));
        verify(deadLetterPublisher, never()).publishToDeadLetter(
            anyString(), anyString(), any(), anyString(), any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: unexpected eventType is dead-lettered and acked")
    void testUnexpectedEventTypeIsDeadLettered() throws Exception {
        OrderPlacedEvent payload = validEvent("order-123");
        EventEnvelope<OrderPlacedEvent> envelope = new EventEnvelope<>();
        envelope.setEventId("eid-2");
        envelope.setEventType("ORDER_FILLED");
        envelope.setEventTime("2026-09-28T09:14:22Z");
        envelope.setSource("trade-api");
        envelope.setSchemaVersion(1);
        envelope.setPayload(payload);
        byte[] messageBytes = objectMapper.writeValueAsBytes(envelope);

        consumer.onOrderPlaced(record("1", messageBytes), acknowledgment);

        verify(executionService, never()).processOrderPlaced(any());
        verify(deadLetterPublisher, times(1)).publishToDeadLetter(
            eq("orders"), eq("1"), any(), anyString(), any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: malformed JSON is dead-lettered and acked")
    void testMalformedJsonIsDeadLettered() {
        byte[] messageBytes = "{invalid json".getBytes(StandardCharsets.UTF_8);

        consumer.onOrderPlaced(record("order-1", messageBytes), acknowledgment);

        verify(deadLetterPublisher, times(1)).publishToDeadLetter(
            eq("orders"), eq("order-1"), any(), anyString(), any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: null body is dead-lettered and acked")
    void testNullBodyIsDeadLettered() {
        ConsumerRecord<String, byte[]> record = record("order-1", null);

        consumer.onOrderPlaced(record, acknowledgment);

        verify(deadLetterPublisher, times(1)).publishToDeadLetter(
            eq("orders"), eq("order-1"), any(), anyString(), any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: permanent failure from service is dead-lettered and acked")
    void testPermanentFailureIsDeadLettered() throws Exception {
        OrderPlacedEvent event = validEvent("order-123");
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        org.mockito.Mockito.doThrow(new PermanentProcessingException("Order not found: 123"))
            .when(executionService).processOrderPlaced(any(OrderPlacedEvent.class));

        consumer.onOrderPlaced(record("account-1", messageBytes), acknowledgment);

        verify(deadLetterPublisher, times(1)).publishToDeadLetter(
            eq("orders"), eq("account-1"), any(), anyString(), any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: transient failure with budget is retried (no ack, no DLT)")
    void testTransientFailureRetriesWithoutAck() throws Exception {
        OrderPlacedEvent event = validEvent("order-123");
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        org.mockito.Mockito.doThrow(new TransientProcessingException("Broker unreachable"))
            .when(executionService).processOrderPlaced(any(OrderPlacedEvent.class));

        assertThrows(TransientProcessingException.class,
            () -> consumer.onOrderPlaced(record("account-1", messageBytes), acknowledgment));

        verify(deadLetterPublisher, never()).publishToDeadLetter(
            anyString(), anyString(), any(), anyString(), any());
        verify(acknowledgment, never()).acknowledge();
    }

    @Test
    @DisplayName("OnOrderPlaced: transient failure with exhausted budget is dead-lettered and acked")
    void testTransientExhaustedIsDeadLettered() throws Exception {
        OrderPlacedEvent event = validEvent("order-123");
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        org.mockito.Mockito.doThrow(new TransientProcessingException("DB connection lost"))
            .when(executionService).processOrderPlaced(any(OrderPlacedEvent.class));

        org.apache.kafka.common.header.Headers headers =
            headersWithRetryCount(3); // max attempts exhausted
        ConsumerRecord<String, byte[]> record = new ConsumerRecord<>(
            "orders", 0, 0L, "account-1", messageBytes);
        headers.forEach(h -> record.headers().add(h));

        consumer.onOrderPlaced(record, acknowledgment);

        verify(deadLetterPublisher, times(1)).publishToDeadLetter(
            eq("orders"), eq("account-1"), any(), anyString(), any());
        verify(acknowledgment, times(1)).acknowledge();
    }

    @Test
    @DisplayName("Consumer group is 'trade-executor'")
    void testConsumerGroupIsCorrect() throws Exception {
        var annotation = OrderPlacedConsumer.class
            .getMethod("onOrderPlaced", ConsumerRecord.class, Acknowledgment.class)
            .getAnnotation(org.springframework.kafka.annotation.KafkaListener.class);
        assertTrue(annotation != null);
        assertEquals("trade-executor", annotation.groupId());
        assertEquals(1, annotation.topics().length);
        assertEquals("orders", annotation.topics()[0]);
    }

    // ========== Helpers ==========

    private OrderPlacedEvent validEvent(String orderId) {
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId(orderId);
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        event.setIdempotencyKey("idempotency-1");
        event.setCreatedOn(String.valueOf(System.currentTimeMillis()));
        return event;
    }

    private ConsumerRecord<String, byte[]> record(String key, byte[] value) {
        return new ConsumerRecord<>("orders", 0, 0L, key, value);
    }

    private org.apache.kafka.common.header.Headers headersWithRetryCount(int count) {
        RecordHeaders headers = new RecordHeaders();
        headers.add("x-retry-count",
            String.valueOf(count).getBytes(StandardCharsets.UTF_8));
        return headers;
    }
}
