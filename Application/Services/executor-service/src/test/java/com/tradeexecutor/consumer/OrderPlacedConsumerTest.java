package com.tradeexecutor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.KafkaMessageEnvelope;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.service.ExecutionService;
import com.tradeexecutor.service.SettlementService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

/**
 * Unit tests for OrderPlacedConsumer.
 * 
 * Tests Kafka consumer behavior for ORDER_PLACED events with DLT support.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("OrderPlacedConsumer Tests")
class OrderPlacedConsumerTest {
    
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
    
    @BeforeEach
    void setUp() throws Exception {
        consumer = new OrderPlacedConsumer(executionService, settlementService, deadLetterPublisher, retryHandler, objectMapper);
    }
    
    @Test
    @DisplayName("OnOrderPlaced: Successful event processing - message acknowledged")
    void testOnOrderPlacedSuccessfulProcessing() throws Exception {
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

        KafkaMessageEnvelope<OrderPlacedEvent> envelope = new KafkaMessageEnvelope<>(
            "event-1",
            "ORDER_PLACED",
            "spring-boot-app",
            String.valueOf(System.currentTimeMillis()),
            1,
            event
        );
        
        ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> record = new ConsumerRecord<>(
            "orders",
            0,
            100L,
            "account-1",
            envelope
        );
        
        // When: Consumer receives the event
        doNothing().when(executionService).processOrderPlaced(event);
        
        consumer.onOrderPlaced(record, envelope, acknowledgment);
        
        // Then: ExecutionService.processOrderPlaced is called with the event
        verify(executionService, times(1)).processOrderPlaced(event);
        verify(acknowledgment, times(1)).acknowledge();
    }
}


