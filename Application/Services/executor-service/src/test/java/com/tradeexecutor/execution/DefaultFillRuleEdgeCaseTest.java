package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("DefaultFillRule defensive branches")
class DefaultFillRuleEdgeCaseTest {

    @Test
    @DisplayName("An unknown side is rejected rather than accidentally treated as a sell")
    void unknownSideIsRejected() {
        Order order = mock(Order.class);
        when(order.getOrderType()).thenReturn(OrderType.LIMIT);
        when(order.getSide()).thenReturn(null);
        when(order.getLimitPrice()).thenReturn(new BigDecimal("100.00"));

        ExecutionResult result = DefaultFillRule.INSTANCE.evaluate(
                order, new BigDecimal("99.00"), new BigDecimal("101.00")
        );

        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertEquals("Unknown order side: null", result.getReason());
        assertNull(result.getExecutionPrice());
    }

    @Test
    @DisplayName("Market order with unknown side is rejected")
    void marketOrderWithUnknownSideIsRejected() {
        Order order = mock(Order.class);
        when(order.getOrderType()).thenReturn(OrderType.MARKET);
        when(order.getSide()).thenReturn(null);

        ExecutionResult result = DefaultFillRule.INSTANCE.evaluate(
                order, new BigDecimal("99.00"), new BigDecimal("101.00")
        );

        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertEquals("Unknown order side: null", result.getReason());
        assertNull(result.getExecutionPrice());
    }

    @Test
    @DisplayName("STOP_LOSS order (limit order type) with no limit price is rejected")
    void stopLossOrderWithoutLimitPriceIsRejected() {
        Order order = mock(Order.class);
        when(order.getOrderType()).thenReturn(OrderType.STOP_LOSS);
        when(order.getSide()).thenReturn(OrderSide.SELL);
        when(order.getLimitPrice()).thenReturn(null);  // STOP_LOSS uses stopPrice, not limitPrice

        ExecutionResult result = DefaultFillRule.INSTANCE.evaluate(
                order, new BigDecimal("99.00"), new BigDecimal("101.00")
        );

        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertEquals("Order limit price is null", result.getReason());
        assertNull(result.getExecutionPrice());
    }
}
