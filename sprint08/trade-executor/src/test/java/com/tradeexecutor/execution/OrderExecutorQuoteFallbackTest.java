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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderExecutor quote-data fallback behavior")
class OrderExecutorQuoteFallbackTest {

    @Mock
    private FauxnanceClient fauxnanceClient;
    @Mock
    private Order order;
    @Mock
    private Instrument instrument;

    private OrderExecutor orderExecutor;

    @BeforeEach
    void setUp() {
        orderExecutor = new OrderExecutor(fauxnanceClient);
        when(instrument.mayBeTraded()).thenReturn(true);
        when(instrument.getSymbol()).thenReturn("AAPL");
        when(order.getOrderId()).thenReturn(1L);
        lenient().when(order.getSide()).thenReturn(OrderSide.BUY);
        lenient().when(order.getLimitPrice()).thenReturn(new BigDecimal("100.00"));
    }

    @Test
    @DisplayName("A last price fills when both bid and ask are missing")
    void lastPriceIsUsedWhenBothSidesAreMissing() {
        QuoteResponse quote = new QuoteResponse();
        quote.setSymbol("AAPL");
        quote.setPrice(new BigDecimal("99.00"));
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));

        ExecutionDecision decision = orderExecutor.execute(order, instrument);

        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("99.00"), decision.getResult().getExecutionPrice());
    }

    @Test
    @DisplayName("A last price replaces a missing bid")
    void lastPriceReplacesMissingBid() {
        QuoteResponse quote = new QuoteResponse();
        quote.setSymbol("AAPL");
        quote.setPrice(new BigDecimal("99.00"));
        quote.setAsk(new BigDecimal("101.00"));
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));

        ExecutionDecision decision = orderExecutor.execute(order, instrument);

        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("99.00"), decision.getResult().getExecutionPrice());
    }

    @Test
    @DisplayName("A last price replaces a missing ask")
    void lastPriceReplacesMissingAsk() {
        QuoteResponse quote = new QuoteResponse();
        quote.setSymbol("AAPL");
        quote.setPrice(new BigDecimal("99.00"));
        quote.setBid(new BigDecimal("98.00"));
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));

        ExecutionDecision decision = orderExecutor.execute(order, instrument);

        assertEquals(ExecutionResult.Status.FILLED, decision.getResult().getStatus());
        assertEquals(new BigDecimal("99.00"), decision.getResult().getExecutionPrice());
    }

    @Test
    @DisplayName("A partially populated quote without a last price remains pricing unavailable")
    void partialQuoteWithoutLastPriceIsUnavailable() {
        QuoteResponse quote = new QuoteResponse();
        quote.setSymbol("AAPL");
        quote.setBid(new BigDecimal("98.00"));
        when(fauxnanceClient.getQuote("AAPL")).thenReturn(Optional.of(quote));

        ExecutionDecision decision = orderExecutor.execute(order, instrument);

        assertEquals(ExecutionResult.Status.PRICING_UNAVAILABLE, decision.getResult().getStatus());
    }
}
