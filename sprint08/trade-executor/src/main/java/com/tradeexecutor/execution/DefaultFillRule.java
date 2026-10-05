package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderSide;
import java.math.BigDecimal;

/**
 * Default fill rule implementation.
 * 
 * Pure function that evaluates whether to fill an order based on:
 * - BUY: Fill when limit price >= quoted price (buy at market or better)
 * - SELL: Fill when limit price <= quoted price (sell at market or better)
 * - Otherwise: REJECT the order
 * 
 * Execution price is always the quoted price.
 */
public class DefaultFillRule implements FillRule {
    
    public static final DefaultFillRule INSTANCE = new DefaultFillRule();
    
    @Override
    public ExecutionResult evaluate(Order order, BigDecimal bid, BigDecimal ask) {
        if (bid == null || ask == null) {
            return ExecutionResult.rejected("Quote bid/ask is missing");
        }
        
        BigDecimal limitPrice = order.getLimitPrice();
        if (limitPrice == null) {
            return ExecutionResult.rejected("Order limit price is null");
        }
        
        OrderSide side = order.getSide();
        
        if (side == OrderSide.BUY) {
            // BUY fills against ask.
            if (limitPrice.compareTo(ask) >= 0) {
                return ExecutionResult.filled(ask);
            } else {
                return ExecutionResult.rejected(
                    "BUY order limit price " + limitPrice + 
                    " is below ask " + ask
                );
            }
        } else if (side == OrderSide.SELL) {
            // SELL fills against bid.
            if (limitPrice.compareTo(bid) <= 0) {
                return ExecutionResult.filled(bid);
            } else {
                return ExecutionResult.rejected(
                    "SELL order limit price " + limitPrice + 
                    " is above bid " + bid
                );
            }
        } else {
            return ExecutionResult.rejected("Unknown order side: " + side);
        }
    }
    
    @Override
    public String getName() {
        return "DEFAULT";
    }
}
