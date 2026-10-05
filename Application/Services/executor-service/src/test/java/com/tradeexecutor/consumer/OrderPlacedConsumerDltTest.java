package com.tradeexecutor.consumer;

import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.KafkaMessageEnvelope;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import com.tradeexecutor.service.SettlementService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for OrderPlacedConsumer with DLT failure handling.
 * 
 * Test scenarios:
 * 1. Successful order processing - message acknowledged, no DLT
 * 2. Permanent failure - DLT immediately
 * 3. Transient failure with recovery - retry succeeds
 * 4. Transient failure with exhaustion - DLT after max retries
 * 5. Null envelope handling - DLT immediately
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("OrderPlacedConsumer - DLT Failure Handling")
class OrderPlacedConsumerDltTest {
    
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
    private Acknowledgment ack;
    
    private OrderPlacedConsumer consumer;
    private KafkaMessageEnvelope<OrderPlacedEvent> envelope;
    private ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> consumerRecord;
    private OrderPlacedEvent orderPlacedEvent;
    
    @BeforeEach
    void setUp() throws Exception {
        // Create consumer manually with mocked dependencies
        consumer = new OrderPlacedConsumer(executionService, settlementService, deadLetterPublisher, retryHandler, objectMapper);
        
        // Create sample order placed event
        orderPlacedEvent = new OrderPlacedEvent();
        orderPlacedEvent.setOrderId("123");
        orderPlacedEvent.setAccountId(456L);
        orderPlacedEvent.setSymbol("AAPL");
        orderPlacedEvent.setSide("BUY");
        orderPlacedEvent.setQuantity(100);
        orderPlacedEvent.setPrice(new BigDecimal("150.00"));
        orderPlacedEvent.setIdempotencyKey("idem-123");
        
        // Create message envelope
        envelope = new KafkaMessageEnvelope<>(
            "event-123",
            "ORDER_PLACED",
            "trading-system",
            "2024-01-15T10:00:00Z",
            1,
            orderPlacedEvent
        );
        
        // Create consumer record
        consumerRecord = new ConsumerRecord<>(
            "orders",
            0,
            100L,
            "account-456",
            envelope
        );
    }
    
    @Test
    @DisplayName("SUCCESS: Process order successfully - acknowledge without DLT")
    void testSuccessfulOrderProcessing() throws Exception {
        doNothing().when(executionService).processOrderPlaced(orderPlacedEvent);
        
        consumer.onOrderPlaced(consumerRecord, envelope, ack);
        
        verify(executionService, times(1)).processOrderPlaced(orderPlacedEvent);
        verify(deadLetterPublisher, never()).publishToDeadLetter(anyString(), anyString(), any(byte[].class), anyString());
        verify(ack, times(1)).acknowledge();
    }
    
    @Test
    @DisplayName("PERMANENT: Order not found - DLT immediately")
    void testPermanentFailure() throws Exception {
        when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[0]);
        PermanentProcessingException ex = new PermanentProcessingException("Order not found: 123");
        doThrow(ex).when(executionService).processOrderPlaced(orderPlacedEvent);
        
        consumer.onOrderPlaced(consumerRecord, envelope, ack);
        
        verify(executionService, times(1)).processOrderPlaced(orderPlacedEvent);
        verify(deadLetterPublisher, times(1)).publishToDeadLetter(eq("orders"), anyString(), any(byte[].class), anyString());
        verify(ack, times(1)).acknowledge();
    }
    
    @Test
    @DisplayName("TRANSIENT: Retry succeeds - no DLT")
    void testTransientFailureRecovery() throws Exception {
        when(retryHandler.calculateBackoffMs(anyInt())).thenReturn(1L);
        doThrow(new TransientProcessingException("DB connection lost"))
            .doNothing()
            .when(executionService).processOrderPlaced(orderPlacedEvent);
        
        when(retryHandler.shouldRetry(1)).thenReturn(true);
        
        consumer.onOrderPlaced(consumerRecord, envelope, ack);
        
        verify(executionService, times(2)).processOrderPlaced(orderPlacedEvent);
        verify(deadLetterPublisher, never()).publishToDeadLetter(anyString(), anyString(), any(byte[].class), anyString());
        verify(ack, times(1)).acknowledge();
    }
    
    @Test
    @DisplayName("TRANSIENT: Retries exhausted - DLT after max attempts")
    void testTransientFailureExhausted() throws Exception {
        when(retryHandler.calculateBackoffMs(anyInt())).thenReturn(1L);
        when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[0]);
        doThrow(new TransientProcessingException("Optimistic lock failed")).when(executionService).processOrderPlaced(orderPlacedEvent);
        
        when(retryHandler.shouldRetry(1)).thenReturn(true);
        when(retryHandler.shouldRetry(2)).thenReturn(true);
        when(retryHandler.shouldRetry(3)).thenReturn(false);
        
        consumer.onOrderPlaced(consumerRecord, envelope, ack);
        
        verify(executionService, times(3)).processOrderPlaced(orderPlacedEvent);
        verify(deadLetterPublisher, times(1)).publishToDeadLetter(eq("orders"), anyString(), any(byte[].class), anyString());
        verify(ack, times(1)).acknowledge();
    }
    
    @Test
    @DisplayName("NULL ENVELOPE: Handle null envelope - DLT immediately")
    void testNullEnvelope() throws Exception {
        when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[0]);
        
        consumer.onOrderPlaced(consumerRecord, null, ack);
        
        verify(executionService, never()).processOrderPlaced(any());
        verify(deadLetterPublisher, times(1)).publishToDeadLetter(eq("orders"), anyString(), any(byte[].class), anyString());
        verify(ack, times(1)).acknowledge();
    }
}
