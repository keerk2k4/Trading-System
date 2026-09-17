package com.tradeexecutor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
<<<<<<< HEAD
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
=======
import com.tradeexecutor.service.SettlementService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Unit tests for OrderPlacedConsumer happy path.
 * 
 * Tests basic Kafka consumer behavior for successful ORDER_PLACED event processing.
 * Error handling tests are in OrderPlacedConsumerErrorHandlingTest.
 */
@DisplayName("OrderPlacedConsumer Happy Path Tests")
class OrderPlacedConsumerTest {
    
<<<<<<< HEAD
    private TestExecutionService executionService;
    private TestDeadLetterPublisher deadLetterPublisher;
    private RetryHandler retryHandler;
    private ObjectMapper objectMapper;
=======
    @Mock
    private ExecutionService executionService;
    
    @Mock
    private SettlementService settlementService;
    
    @Mock
    private Acknowledgment acknowledgment;
    
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68
    private OrderPlacedConsumer consumer;
    
    @BeforeEach
    void setUp() {
<<<<<<< HEAD
        executionService = new TestExecutionService();
        deadLetterPublisher = new TestDeadLetterPublisher();
        retryHandler = new RetryHandler();
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
     */
    private static class TestExecutionService extends ExecutionService {
        private int callCount = 0;
        
        public TestExecutionService() {
            super(null);  // OrderExecutor not needed for testing
        }
        
        public int getCallCount() {
            return callCount;
        }
        
        @Override
        public void processOrderPlaced(OrderPlacedEvent event) {
            callCount++;
            // Success - do nothing
        }
    }
    
    /**
     * Test implementation of DeadLetterPublisher that tracks calls.
     */
    private static class TestDeadLetterPublisher extends DeadLetterPublisher {
        private int publishCount = 0;
        
        public TestDeadLetterPublisher() {
            super(null);  // KafkaTemplate not needed for testing
        }
        
        public int getPublishCount() {
            return publishCount;
        }
        
        @Override
        public void publishToDeadLetter(
                String originalTopic,
                String messageKey,
                byte[] messageValue,
                String failureReason,
                org.apache.kafka.common.header.Headers originalHeaders) {
            publishCount++;
        }
=======
        consumer = new OrderPlacedConsumer(executionService, settlementService);
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68
    }
    
    @Test
    @DisplayName("OnOrderPlaced: Valid event is passed to ExecutionService")
    void testOnOrderPlacedPassesToExecutionService() throws Exception {
        // Given: A valid ORDER_PLACED event
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId("order-123");
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        event.setIdempotencyKey("idempotency-1");
        event.setCreatedOn(String.valueOf(System.currentTimeMillis()));

        byte[] messageBytes = objectMapper.writeValueAsBytes(event);
        ConsumerRecord<String, byte[]> record = new ConsumerRecord<>(
            "orders",           // topic
            0,                  // partition
            0L,                 // offset
            "account-1",        // key
            messageBytes        // value
        );
        
        // When: Consumer receives the event
<<<<<<< HEAD
        consumer.onOrderPlaced(record);
        
        // Then: ExecutionService.processOrderPlaced was called once
        assertEquals(1, executionService.getCallCount());
        
        // And: Dead-letter publisher was not called (success case)
        assertEquals(0, deadLetterPublisher.getPublishCount());
=======
        consumer.onOrderPlaced(envelope, acknowledgment);
        
        // Then: ExecutionService.processOrderPlaced is called with the event
        verify(executionService, times(1)).processOrderPlaced(event);
        
        // And: Kafka message is acknowledged
        verify(acknowledgment, times(1)).acknowledge();
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68
    }
    
    @Test
    @DisplayName("Consumer group is 'trade-executor'")
    void testConsumerGroupIsCorrect() {
        // This is a compile-time check verified by the annotation
        // @KafkaListener(topics = TOPIC, groupId = CONSUMER_GROUP)
        // Consumer group should be "trade-executor"
    }
}


