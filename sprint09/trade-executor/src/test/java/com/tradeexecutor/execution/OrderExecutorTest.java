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
    
    @Test
    @DisplayName("Instrument not tradable -> INSTRUMENT_NOT_TRADABLE result")
    void testExecuteOrderWithNonTradableInstrument() {
        when(mockInstrument.mayBeTraded()).thenReturn(false);
        when(mockInstrument.getSymbol()).thenReturn("HALTED");
        when(mockOrder.getOrderId()).thenReturn(1L);
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.INSTRUMENT_NOT_TRADABLE, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        verify(fauxnanceClient, never()).getQuote(anyString());
    }
    
    @Test
    @DisplayName("Tradable instrument, BUY order filled at quote")
    void testExecuteBuyOrderFilledAtQuote() {
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
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("145.01"), decision.getResult().getExecutionPrice());
        assertEquals("DEFAULT", decision.getFillRuleName());
        
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("Tradable instrument, SELL order filled at quote")
    void testExecuteSellOrderFilledAtQuote() {
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
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("144.99"), decision.getResult().getExecutionPrice());
        assertEquals("DEFAULT", decision.getFillRuleName());
        
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("Tradable instrument, BUY order rejected outside range")
    void testExecuteBuyOrderRejectedOutsideRange() {
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
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.REJECTED, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("Tradable instrument, Fauxnance unavailable -> PRICING_UNAVAILABLE result")
    void testExecuteOrderWithFauxnanceUnavailable() {
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(4L);
        
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.empty());
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.PRICING_UNAVAILABLE, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("Quote with null price -> PRICING_UNAVAILABLE result")
    void testExecuteOrderWithNullPrice() {
        when(mockInstrument.mayBeTraded()).thenReturn(true);
        when(mockInstrument.getSymbol()).thenReturn("AAPL");
        when(mockOrder.getOrderId()).thenReturn(5L);
        
        QuoteResponse quoteWithNullPrice = new QuoteResponse();
        quoteWithNullPrice.setSymbol("AAPL");
        quoteWithNullPrice.setPrice(null);
        
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quoteWithNullPrice));
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals(ExecutionResult.Status.PRICING_UNAVAILABLE, decision.getResult().getStatus());
        assertNull(decision.getResult().getExecutionPrice());
        assertNotNull(decision.getResult().getReason());
        
        verify(fauxnanceClient, times(1)).getQuote("AAPL");
    }
    
    @Test
    @DisplayName("ExecutionDecision contains fill rule name")
    void testExecutionDecisionContainsFillRuleName() {
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
        
        ExecutionDecision decision = orderExecutor.execute(mockOrder, mockInstrument);
        
        assertNotNull(decision);
        assertEquals("DEFAULT", decision.getFillRuleName());
        assertTrue(decision.isFilled());
    }
}