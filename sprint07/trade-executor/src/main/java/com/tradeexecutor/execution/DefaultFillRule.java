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
    public ExecutionResult evaluate(Order order, BigDecimal quotedPrice) {
        if (quotedPrice == null) {
            return ExecutionResult.rejected("Quote price is null");
        }
        
        BigDecimal limitPrice = order.getLimitPrice();
        if (limitPrice == null) {
            return ExecutionResult.rejected("Order limit price is null");
        }
        
        OrderSide side = order.getSide();
        
        if (side == OrderSide.BUY) {
            // For BUY orders: fill if limit price >= quoted price
            if (limitPrice.compareTo(quotedPrice) >= 0) {
                return ExecutionResult.filled(quotedPrice);
            } else {
                return ExecutionResult.rejected(
                    "BUY order limit price " + limitPrice + 
                    " is below quoted price " + quotedPrice
                );
            }
        } else if (side == OrderSide.SELL) {
            // For SELL orders: fill if limit price <= quoted price
            if (limitPrice.compareTo(quotedPrice) <= 0) {
                return ExecutionResult.filled(quotedPrice);
            } else {
                return ExecutionResult.rejected(
                    "SELL order limit price " + limitPrice + 
                    " is above quoted price " + quotedPrice
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
