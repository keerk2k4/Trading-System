package com.tradeexecutor.service;

import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.execution.OrderExecutor;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for ExecutionService error handling and validation.
 * 
 * Tests permanent failures that should be caught early.
 */
@DisplayName("ExecutionService Validation Tests")
class ExecutionServiceTest {
    
    private ExecutionService executionService;
    
    @BeforeEach
    void setUp() {
        // Create a real OrderExecutor instance instead of mocking
        // This avoids Mockito inline mocking issues with Java 21+
        OrderExecutor orderExecutor = new OrderExecutor(null);  // FauxnanceClient will be null
        executionService = new ExecutionService(orderExecutor);
    }
    
    @Test
    @DisplayName("Throws PermanentProcessingException when event is null")
    void testThrowsExceptionWhenEventIsNull() {
        // Given: Null event
        OrderPlacedEvent event = null;
        
        // When/Then: Should throw PermanentProcessingException
        PermanentProcessingException exception = assertThrows(
            PermanentProcessingException.class,
            () -> executionService.processOrderPlaced(event)
        );
        
        assertTrue(exception.getFailureReason().contains("null"));
    }
    
    @Test
    @DisplayName("Throws PermanentProcessingException when orderId is null")
    void testThrowsExceptionWhenOrderIdIsNull() {
        // Given: Event with null orderId
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId(null);
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        
        // When/Then: Should throw PermanentProcessingException
        PermanentProcessingException exception = assertThrows(
            PermanentProcessingException.class,
            () -> executionService.processOrderPlaced(event)
        );
        
        assertTrue(exception.getFailureReason().contains("orderId"));
    }
    
    @Test
    @DisplayName("Throws PermanentProcessingException when orderId is empty")
    void testThrowsExceptionWhenOrderIdIsEmpty() {
        // Given: Event with empty orderId
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId("   ");  // Whitespace only
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        
        // When/Then: Should throw PermanentProcessingException
        PermanentProcessingException exception = assertThrows(
            PermanentProcessingException.class,
            () -> executionService.processOrderPlaced(event)
        );
        
        assertTrue(exception.getFailureReason().contains("orderId"));
    }
    
    @Test
    @DisplayName("Validates required fields before processing")
    void testValidatesRequiredFieldsBeforeProcessing() {
        // Given: Event with valid orderId but will fail later due to stub
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId("order-123");
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        
        // When: Processing valid event
        // Then: Should fail with UnsupportedOperationException (from stub method) not PermanentProcessingException
        UnsupportedOperationException exception = assertThrows(
            UnsupportedOperationException.class,
            () -> executionService.processOrderPlaced(event)
        );
        
        // Verify: The error is from stub method, not from validation
        assertTrue(exception.getMessage().contains("database"));
    }
}

