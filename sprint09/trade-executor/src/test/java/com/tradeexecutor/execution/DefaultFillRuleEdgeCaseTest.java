package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Order;
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
        when(order.getSide()).thenReturn(null);
        when(order.getLimitPrice()).thenReturn(new BigDecimal("100.00"));

        ExecutionResult result = DefaultFillRule.INSTANCE.evaluate(
                order, new BigDecimal("99.00"), new BigDecimal("101.00")
        );

        assertEquals(ExecutionResult.Status.REJECTED, result.getStatus());
        assertEquals("Unknown order side: null", result.getReason());
        assertNull(result.getExecutionPrice());
    }
}
