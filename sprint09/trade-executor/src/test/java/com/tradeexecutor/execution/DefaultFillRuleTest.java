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
    
    @Test
    @DisplayName("BUY order with limit price >= ask -> FILLED at ask")
    void testBuyOrderAboveQuote() {
        when(mockBuyOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockBuyOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal bid = new BigDecimal("144.50");
        BigDecimal ask = new BigDecimal("145.00");
        
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(ask, result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("BUY order with limit price == ask -> FILLED at ask")
    void testBuyOrderEqualToQuote() {
        when(mockBuyOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockBuyOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal bid = new BigDecimal("149.50");
        BigDecimal ask = new BigDecimal("150.00");
        
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(ask, result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("SELL order with limit price <= bid -> FILLED at bid")
    void testSellOrderBelowQuote() {
        when(mockSellOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockSellOrder.getLimitPrice()).thenReturn(new BigDecimal("140.00"));
        BigDecimal bid = new BigDecimal("145.00");
        BigDecimal ask = new BigDecimal("145.50");
        
        ExecutionResult result = fillRule.evaluate(mockSellOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(bid, result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("SELL order with limit price == bid -> FILLED at bid")
    void testSellOrderEqualToQuote() {
        when(mockSellOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockSellOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal bid = new BigDecimal("150.00");
        BigDecimal ask = new BigDecimal("150.50");
        
        ExecutionResult result = fillRule.evaluate(mockSellOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.FILLED, result.getStatus());
        assertEquals(bid, result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("BUY order with limit price below ask -> REJECTED")
    void testBuyOrderBelowQuote() {
        when(mockBuyOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockBuyOrder.getLimitPrice()).thenReturn(new BigDecimal("140.00"));
        BigDecimal bid = new BigDecimal("144.50");
        BigDecimal ask = new BigDecimal("145.00");
        
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
        assertNotNull(result.getReason());
    }
    
    @Test
    @DisplayName("SELL order with limit price above bid -> REJECTED")
    void testSellOrderAboveQuote() {
        when(mockSellOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockSellOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        BigDecimal bid = new BigDecimal("145.00");
        BigDecimal ask = new BigDecimal("145.50");
        
        ExecutionResult result = fillRule.evaluate(mockSellOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
        assertNotNull(result.getReason());
    }
    
    @Test
    @DisplayName("Null bid/ask -> REJECTED")
    void testNullQuotePrice() {
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, null, null);
        
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("Null limit price -> REJECTED")
    void testNullLimitPrice() {
        when(mockBuyOrder.getLimitPrice()).thenReturn(null);
        BigDecimal bid = new BigDecimal("149.50");
        BigDecimal ask = new BigDecimal("150.00");
        
        ExecutionResult result = fillRule.evaluate(mockBuyOrder, bid, ask);
        
        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertNull(result.getExecutionPrice());
    }
    
    @Test
    @DisplayName("Fill rule name is DEFAULT")
    void testFillRuleName() {
        assertEquals("DEFAULT", fillRule.getName());
    }
}