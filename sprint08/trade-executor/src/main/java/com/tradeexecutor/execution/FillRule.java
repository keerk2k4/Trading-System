package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Order;
import java.math.BigDecimal;

/**
 * Interface for order fill rules.
 * 
 * A FillRule is a PURE function that takes an order and a quoted price
 * and returns an ExecutionResult.
 * 
 * Pure function contract:
 * - MUST NOT access database
 * - MUST NOT call HTTP or any external services
 * - MUST NOT access Kafka or any messaging system
 * - MUST NOT access sockets or any I/O
 * - MUST NOT modify any state
 * - MUST be deterministic: same inputs always produce same output
 */
public interface FillRule {
    
    /**
     * Evaluate whether to fill the order using side-aware bid/ask prices.
     * 
     * BUY compares against ask and fills at ask.
     * SELL compares against bid and fills at bid.
     * 
     * @param order The order to evaluate (contains limit price, side, quantity)
     * @param bid The current best bid from Fauxnance
     * @param ask The current best ask from Fauxnance
     * @return An ExecutionResult indicating FILLED, REJECTED, or other status
     */
    ExecutionResult evaluate(Order order, BigDecimal bid, BigDecimal ask);
    
    /**
     * Get the name of this fill rule (e.g., "DEFAULT", "IOC", "FOK")
     * 
     * @return The fill rule name
     */
    String getName();
}

