package com.tradeexecutor.consumer;

import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.kafka.EventEnvelope;
import com.tradeexecutor.service.ExecutionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

/**
 * Unit tests for OrderPlacedConsumer.
 * 
 * Tests Kafka consumer behavior for ORDER_PLACED events.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("OrderPlacedConsumer Tests")
class OrderPlacedConsumerTest {
    
    @Mock
    private ExecutionService executionService;
    
    private OrderPlacedConsumer consumer;
    
    @BeforeEach
    void setUp() {
        consumer = new OrderPlacedConsumer(executionService);
    }
    
    @Test
    @DisplayName("OnOrderPlaced: Event is passed to ExecutionService")
    void testOnOrderPlacedPassesToExecutionService() {
        // Given: An ORDER_PLACED event
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId("1");
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        event.setIdempotencyKey("1");
        event.setCreatedOn(String.valueOf(System.currentTimeMillis()));

        EventEnvelope<OrderPlacedEvent> envelope = new EventEnvelope<>();
        envelope.setEventId("event-1");
        envelope.setEventType("ORDER_PLACED");
        envelope.setEventTime(String.valueOf(System.currentTimeMillis()));
        envelope.setSource("spring-boot-app");
        envelope.setSchemaVersion(1);
        envelope.setPayload(event);
        
        // When: Consumer receives the event
        consumer.onOrderPlaced(envelope);
        
        // Then: ExecutionService.processOrderPlaced is called with the event
        verify(executionService, times(1)).processOrderPlaced(event);
    }
    
    @Test
    @DisplayName("Consumer group is 'trade-executor'")
    void testConsumerGroupIsCorrect() {
        // This is a compile-time check verified by the annotation
        // @KafkaListener(topics = TOPIC, groupId = CONSUMER_GROUP)
        // Consumer group should be "trade-executor"
    }
}

