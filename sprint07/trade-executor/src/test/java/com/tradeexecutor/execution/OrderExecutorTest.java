package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradeexecutor.client.FauxnanceClient;
import com.tradeexecutor.client.QuoteResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Unit tests for OrderExecutor.
 * 
 * Tests the complete execution flow:
 * - Instrument tradability check
 * - Quote fetching
 * - Fill rule application
 */
@DisplayName("OrderExecutor Tests")
@ExtendWith(MockitoExtension.class)
class OrderExecutorTest {
    
    @Mock
    private FauxnanceClient fauxnanceClient;
    
    @Mock
    private Order mockOrder;
    
    @Mock
    private Instrument mockInstrument;
    
    private OrderExecutor orderExecutor;
    
    @BeforeEach
    void setUp() {
        orderExecutor = new OrderExecutor(fauxnanceClient);
    }
    
    /**
     * Test Case 5: Instrument not tradable -> order does not execute
     */
    @Test
    @DisplayName("Instrument not tradable -> INSTRUMENT_NOT_TRADABLE result")
    void testExecuteOrderWithNonTradableInstrument() {
        // Given: A non-tradable instrument
        when(mockInstrument.mayBeTraded()).thenReturn(false);
        when(mockInstrument.getSymbol()).thenReturn("HALTED");
        when(mockOrder.getOrderId()).thenReturn(1L);
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Result should be INSTRUMENT_NOT_TRADABLE
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.INSTRUMENT_NOT_TRADABLE, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        // Verify Fauxnance was NOT called
        verify(fauxnanceClient, never()).getQuote(anyString());
    }
    
    /**
     * Test Case 1: BUY limit at or above quote -> FILLED at quote (via OrderExecutor)
     */
    @Test
    @DisplayName("Tradable instrument, BUY order filled at quote")
    void testExecuteBuyOrderFilledAtQuote() {
        // Given: A tradable instrument, BUY order with limit price 150.00, quote 145.00
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(1L);
        when(mockOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        
        QuoteResponse quote = new QuoteResponse(
            "AAPL",
            new BigDecimal("145.00"),
            new BigDecimal("144.99"),
            new BigDecimal("145.01"),
            System.currentTimeMillis()
        );
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Order should be FILLED at quote price
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("145.00"), decision.getResult().getExecutionPrice());
        assertEquals("DEFAULT", decision.getFillRuleName());
        
        // Verify Fauxnance was called
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    /**
     * Test Case 2: SELL limit at or below quote -> FILLED at quote (via OrderExecutor)
     */
    @Test
    @DisplayName("Tradable instrument, SELL order filled at quote")
    void testExecuteSellOrderFilledAtQuote() {
        // Given: A tradable instrument, SELL order with limit price 140.00, quote 145.00
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(2L);
        when(mockOrder.getSide()).thenReturn(OrderSide.SELL);
        when(mockOrder.getLimitPrice()).thenReturn(new BigDecimal("140.00"));
        
        QuoteResponse quote = new QuoteResponse(
            "AAPL",
            new BigDecimal("145.00"),
            new BigDecimal("144.99"),
            new BigDecimal("145.01"),
            System.currentTimeMillis()
        );
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Order should be FILLED at quote price
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("145.00"), decision.getResult().getExecutionPrice());
        assertEquals("DEFAULT", decision.getFillRuleName());
        
        // Verify Fauxnance was called
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    /**
     * Test Case 3: Order outside marketable range -> REJECTED (via OrderExecutor)
     */
    @Test
    @DisplayName("Tradable instrument, BUY order rejected outside range")
    void testExecuteBuyOrderRejectedOutsideRange() {
        // Given: A tradable instrument, BUY order with limit price 140.00, quote 145.00
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(3L);
        when(mockOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockOrder.getLimitPrice()).thenReturn(new BigDecimal("140.00"));
        
        QuoteResponse quote = new QuoteResponse(
            "AAPL",
            new BigDecimal("145.00"),
            new BigDecimal("144.99"),
            new BigDecimal("145.01"),
            System.currentTimeMillis()
        );
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Order should be REJECTED
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.REJECTED, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        // Verify Fauxnance was called
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    /**
     * Test Case 4: Fauxnance unavailable after retry budget -> pricing-unavailable result
     */
    @Test
    @DisplayName("Tradable instrument, Fauxnance unavailable -> PRICING_UNAVAILABLE result")
    void testExecuteOrderWithFauxnanceUnavailable() {
        // Given: A tradable instrument, but Fauxnance returns no quote
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(4L);
        
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.empty());
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Result should be PRICING_UNAVAILABLE
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.PRICING_UNAVAILABLE, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        // Verify Fauxnance was called
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("Quote with null price -> PRICING_UNAVAILABLE result")
    void testExecuteOrderWithNullPrice() {
        // Given: A tradable instrument, but quote has null price
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(5L);
        
        QuoteResponse quoteWithNullPrice = new QuoteResponse();
        quoteWithNullPrice.setSymbol("AAPL");
        quoteWithNullPrice.setPrice(null);  // null price
        
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quoteWithNullPrice));
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Result should be PRICING_UNAVAILABLE
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.PRICING_UNAVAILABLE, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        // Verify Fauxnance was called
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("ExecutionDecision contains fill rule name")
    void testExecutionDecisionContainsFillRuleName() {
        // Given: A tradable instrument, successful order execution
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(6L);
        when(mockOrder.getSide()).thenReturn(OrderSide.BUY);
        when(mockOrder.getLimitPrice()).thenReturn(new BigDecimal("150.00"));
        
        QuoteResponse quote = new QuoteResponse(
            "AAPL",
            new BigDecimal("145.00"),
            new BigDecimal("144.99"),
            new BigDecimal("145.01"),
            System.currentTimeMillis()
        );
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));
        
        // When: Execute order
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        // Then: Decision should contain fill rule name
        assertNotNull(decision);
        assertEquals("DEFAULT", decision.getFillRuleName());
        assertTrue(decision.isFilled());
    }
}

