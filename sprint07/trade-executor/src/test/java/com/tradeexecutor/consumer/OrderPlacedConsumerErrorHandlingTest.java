package com.tradeexecutor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Integration tests for error handling, retries, and dead-lettering in OrderPlacedConsumer.
 * 
 * Tests the three scenarios from the acceptance criteria:
 * 1. Malformed message → dead-lettered immediately (zero retries)
 * 2. Transient failure → retried and succeeds (no DLT)
 * 3. Poison message doesn't block partition
 */
@DisplayName("OrderPlacedConsumer Error Handling Tests")
class OrderPlacedConsumerErrorHandlingTest {
    
    private TestExecutionService executionService;
    private TestDeadLetterPublisher deadLetterPublisher;
    private RetryHandler retryHandler;
    private ObjectMapper objectMapper;
    private OrderPlacedConsumer consumer;
    
    @BeforeEach
    void setUp() {
        // Use test implementations instead of mocking to avoid Mockito issues
        executionService = new TestExecutionService();
        deadLetterPublisher = new TestDeadLetterPublisher();
        retryHandler = new RetryHandler();
        
        // Configure RetryHandler with test values (normally come from application.yml via Spring @Value)
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
    
    // ========== Test Implementation Classes ==========
    
    /**
     * Test implementation of ExecutionService that allows configuring behavior.
     *
     * Does NOT call the parent DB workflow (which needs mappers); it mirrors the
     * parent's fast validation (null event / missing orderId) so consumer-level
     * permanent vs transient handling can be tested in isolation.
     */
    private static class TestExecutionService extends ExecutionService {
        private Throwable exceptionToThrow = null;
        private int callCount = 0;

        public TestExecutionService() {
            super(null, null, null, null);  // collaborators not needed for these tests
        }
        
        public void setExceptionToThrow(Throwable exception) {
            this.exceptionToThrow = exception;
        }

        public void setFailOnAttempt(int attemptNumber, Throwable exception) {
            this.exceptionToThrow = exception;
        }

        public int getCallCount() {
            return callCount;
        }

        @Override
        public void processOrderPlaced(OrderPlacedEvent event) {
            // Mirror ExecutionService fast validation (permanent failures first)
            if (event == null) {
                throw new PermanentProcessingException("Received null ORDER_PLACED event");
            }
            if (event.getOrderId() == null || event.getOrderId().trim().isEmpty()) {
                throw new PermanentProcessingException(
                    "ORDER_PLACED event missing required field: orderId"
                );
            }
            callCount++;
            if (exceptionToThrow != null) {
                if (exceptionToThrow instanceof RuntimeException) {
                    throw (RuntimeException) exceptionToThrow;
                } else {
                    throw new RuntimeException(exceptionToThrow);
                }
            }
        }
    }
    
    /**
     * Test implementation of DeadLetterPublisher that tracks calls.
     */
    private static class TestDeadLetterPublisher extends DeadLetterPublisher {
        private int publishCount = 0;
        private String lastFailureReason = null;
        
        public TestDeadLetterPublisher() {
            super(null);  // KafkaTemplate not needed for testing
        }
        
        public int getPublishCount() {
            return publishCount;
        }
        
        public String getLastFailureReason() {
            return lastFailureReason;
        }
        
        @Override
        public void publishToDeadLetter(
                String originalTopic,
                String messageKey,
                byte[] messageValue,
                String failureReason,
                org.apache.kafka.common.header.Headers originalHeaders) {
            publishCount++;
            lastFailureReason = failureReason;
        }
    }
    // ========== Test Scenario 1: Malformed Message ==========
    
    @Test
    @DisplayName("Scenario 1: Malformed JSON is dead-lettered immediately (zero retries)")
    void testMalformedJsonIsDeadLetteredImmediately() {
        // Given: A malformed JSON message
        String malformedJson = "{invalid json";
        byte[] messageBytes = malformedJson.getBytes(StandardCharsets.UTF_8);
        ConsumerRecord<String, byte[]> record = createConsumerRecord("order-1", messageBytes);
        
        // When: Consumer processes the malformed message
        consumer.onOrderPlaced(record);
        
        // Verify: ExecutionService was never called
        assertEquals(0, executionService.getCallCount());
        
        // Verify: Message was sent to DLT
        assertEquals(1, deadLetterPublisher.getPublishCount());
        assertTrue(deadLetterPublisher.getLastFailureReason().contains("Malformed JSON"));
    }
    
    @Test
    @DisplayName("Scenario 1: Missing orderId is dead-lettered immediately")
    void testMissingOrderIdIsDeadLetteredImmediately() throws Exception {
        // Given: A valid JSON but missing orderId
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId(null);  // Missing order ID
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        ConsumerRecord<String, byte[]> record = createConsumerRecord("account-1", messageBytes);
        
        // When: Consumer processes the message
        consumer.onOrderPlaced(record);
        
        // Verify: ExecutionService was not called
        assertEquals(0, executionService.getCallCount());
        
        // Verify: Message was sent to DLT
        assertEquals(1, deadLetterPublisher.getPublishCount());
        assertTrue(deadLetterPublisher.getLastFailureReason().contains("orderId"));
    }
    
    // ========== Test Scenario 2: Transient Failure with Retry ==========
    
    @Test
    @DisplayName("Scenario 2: Transient failure is retried and succeeds (not DLT'd after success)")
    void testTransientFailureIsRetriedAndSucceeds() throws Exception {
        // Given: A valid message that fails transiently on first attempt, succeeds on second
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId("order-123");
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        
        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        ConsumerRecord<String, byte[]> record = createConsumerRecord("account-1", messageBytes);
        
        // First call: throw transient exception
        // Second call: succeed
        executionService.setExceptionToThrow(new TransientProcessingException("Broker unreachable"));
        
        // When: Consumer processes the message first time
        assertThrows(TransientProcessingException.class, () -> {
            consumer.onOrderPlaced(record);
        });
        
        // Verify: executionService was called once
        assertEquals(1, executionService.getCallCount());
        
        // Verify: Message was NOT dead-lettered (still in retry phase)
        assertEquals(0, deadLetterPublisher.getPublishCount());
        
        // ===== Second attempt (message redelivered) =====
        ConsumerRecord<String, byte[]> record2 = createConsumerRecord("account-1", messageBytes);
        executionService.setExceptionToThrow(null);  // Now it succeeds
        
        // When: Consumer processes the message second time (succeeds)
        consumer.onOrderPlaced(record2);
        
        // Verify: executionService was called again (total 2 times)
        assertEquals(2, executionService.getCallCount());
        
        // Verify: Message was never dead-lettered (succeeded on retry)
        assertEquals(0, deadLetterPublisher.getPublishCount());
    }
    
    @Test
    @DisplayName("Scenario 2: Transient failure with backoff calculation")
    void testTransientFailureBackoffCalculation() {
        // Given: RetryHandler
        // When: We calculate backoff for different retry counts
        // Then: Verify exponential backoff
        
        long delay0 = retryHandler.calculateBackoffDelayMs(0);
        long delay1 = retryHandler.calculateBackoffDelayMs(1);
        long delay2 = retryHandler.calculateBackoffDelayMs(2);
        
        // With default config: initial=100ms, multiplier=2.0
        assertEquals(100, delay0);  // 100 * 2^0 = 100
        assertEquals(200, delay1);  // 100 * 2^1 = 200
        assertEquals(400, delay2);  // 100 * 2^2 = 400
    }
    
    // ========== Test Scenario 3: Poison Message Doesn't Block Partition ==========
    
    @Test
    @DisplayName("Scenario 3: Poison message is dead-lettered, valid message after it is processed")
    void testPoisonMessageDoesNotBlockPartition() throws Exception {
        // Given: A poison message followed by a valid message
        String poisonJson = "{invalid}";
        byte[] poisonBytes = poisonJson.getBytes(StandardCharsets.UTF_8);
        ConsumerRecord<String, byte[]> poisonRecord = createConsumerRecord("key1", poisonBytes);
        
        OrderPlacedEvent validEvent = new OrderPlacedEvent();
        validEvent.setOrderId("order-456");
        validEvent.setAccountId(2L);
        validEvent.setSymbol("AAPL");
        validEvent.setSide("BUY");
        validEvent.setQuantity(100);
        validEvent.setPrice(new BigDecimal("150.00"));
        
        byte[] validBytes = objectMapper.writeValueAsBytes(validEvent);
        ConsumerRecord<String, byte[]> validRecord = createConsumerRecord("key2", validBytes);
        
        // When: Consumer processes poison message
        consumer.onOrderPlaced(poisonRecord);
        
        // Verify: Poison message was dead-lettered
        assertEquals(1, deadLetterPublisher.getPublishCount());
        assertTrue(deadLetterPublisher.getLastFailureReason().contains("Malformed JSON"));
        
        // Verify: ExecutionService was never called for poison message
        assertEquals(0, executionService.getCallCount());
        
        // Reset counters
        deadLetterPublisher.publishCount = 0;
        executionService.callCount = 0;
        
        // When: Consumer processes valid message
        consumer.onOrderPlaced(validRecord);
        
        // Verify: Valid message was processed successfully
        assertEquals(1, executionService.getCallCount());
        
        // Verify: Valid message was NOT dead-lettered
        assertEquals(0, deadLetterPublisher.getPublishCount());
    }
    
    // ========== Helper Methods ==========
    
    /**
     * Create a ConsumerRecord with the given key and value.
     */
    private ConsumerRecord<String, byte[]> createConsumerRecord(String key, byte[] value) {
        org.apache.kafka.common.header.Headers headers = new RecordHeaders();
        return new ConsumerRecord<>(
            "orders",           // topic
            0,                  // partition
            0L,                 // offset
            key,                // key
            value               // value
        );
    }
}
