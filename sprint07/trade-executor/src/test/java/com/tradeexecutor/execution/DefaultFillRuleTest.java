package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderSide;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * Unit tests for DefaultFillRule.
 * 
 * Tests the pure fill rule logic:
 * - BUY: fill when limit price >= quoted price
 * - SELL: fill when limit price <= quoted price
 * - Otherwise: REJECT
 */
@DisplayName("DefaultFillRule Tests")
@ExtendWith(MockitoExtension.class)
class DefaultFillRuleTest {
    
    private DefaultFillRule fillRule;
    
    @Mock
    private Order mockBuyOrder;
    
    @Mock
    private Order mockSellOrder;
    
    @BeforeEach
    void setUp() {
        fillRule = DefaultFillRule.INSTANCE;
    }
    
    /**
     * Test Case 1: BUY limit at or above quote -> FILLED at quote
     */
    @Test
    @DisplayName("BUY order with limit price >= quote price -> FILLED at quote")
    void testBuyOrderAboveQuote() {
        // Given: A BUY order with limit price 150.00 and quote price 145.00
        when(mockBuyOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockBuyOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal quotePrice = new BigDecimal("145.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, quotePrice);
        
        // Then: Order should be FILLED at quote price
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(quotePrice, result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("BUY order with limit price == quote price -> FILLED at quote")
    void testBuyOrderEqualToQuote() {
        // Given: A BUY order with limit price 150.00 and quote price 150.00
        when(mockBuyOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockBuyOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal quotePrice = new BigDecimal("150.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, quotePrice);
        
        // Then: Order should be FILLED at quote price
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(quotePrice, result.getExecutionPrice());
    }
    
    /**
     * Test Case 2: SELL limit at or below quote -> FILLED at quote
     */
    @Test
    @DisplayName("SELL order with limit price <= quote price -> FILLED at quote")
    void testSellOrderBelowQuote() {
        // Given: A SELL order with limit price 140.00 and quote price 145.00
        when(mockSellOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockSellOrder.getLimitPrice()).thenReturn(new BigDecimal("140.00"));
        BigDecimal quotePrice = new BigDecimal("145.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockSellOrder, quotePrice);
        
        // Then: Order should be FILLED at quote price
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(quotePrice, result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("SELL order with limit price == quote price -> FILLED at quote")
    void testSellOrderEqualToQuote() {
        // Given: A SELL order with limit price 150.00 and quote price 150.00
        when(mockSellOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockSellOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal quotePrice = new BigDecimal("150.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockSellOrder, quotePrice);
        
        // Then: Order should be FILLED at quote price
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(quotePrice, result.getExecutionPrice());
    }
    
    /**
     * Test Case 3: Order outside marketable range -> REJECTED
     */
    @Test
    @DisplayName("BUY order with limit price below quote price -> REJECTED")
    void testBuyOrderBelowQuote() {
        // Given: A BUY order with limit price 140.00 and quote price 145.00
        when(mockBuyOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockBuyOrder.getLimitPrice()).thenReturn(new BigDecimal("140.00"));
        BigDecimal quotePrice = new BigDecimal("145.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, quotePrice);
        
        // Then: Order should be REJECTED
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
        assertNotNull(result.getReason());
    }
    
    @Test
    @DisplayName("SELL order with limit price above quote price -> REJECTED")
    void testSellOrderAboveQuote() {
        // Given: A SELL order with limit price 150.00 and quote price 145.00
        when(mockSellOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockSellOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal quotePrice = new BigDecimal("145.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockSellOrder, quotePrice);
        
        // Then: Order should be REJECTED
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
        assertNotNull(result.getReason());
    }
    
    @Test
    @DisplayName("Null quote price -> REJECTED")
    void testNullQuotePrice() {
        // Given: An order and null quote price
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, null);
        
        // Then: Order should be REJECTED
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("Null limit price -> REJECTED")
    void testNullLimitPrice() {
        // Given: An order with null limit price (edge case)
        when(mockBuyOrder.getLimitPrice()).thenReturn(null);
        BigDecimal quotePrice = new BigDecimal("150.00");
        
        // When: Apply fill rule
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, quotePrice);
        
        // Then: Order should be REJECTED
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("Fill rule name is DEFAULT")
    void testFillRuleName() {
        // Given: DefaultFillRule instance
        // Then: Name should be "DEFAULT"
        assertEquals("DEFAULT", fillRule.getName());
    }
}

