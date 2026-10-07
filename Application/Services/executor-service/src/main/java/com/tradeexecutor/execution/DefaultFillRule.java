package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import java.math.BigDecimal;

/**
 * Default fill rule implementation.
 * 
 * Pure function that evaluates whether to fill an order based on:
 * - MARKET orders: Fill immediately at quoted price (BUY at ask, SELL at bid)
 * - LIMIT orders:
 *   - BUY: Fill when limit price >= quoted price (buy at market or better)
 *   - SELL: Fill when limit price <= quoted price (sell at market or better)
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
        
        OrderSide side = order.getSide();
        OrderType orderType = order.getOrderType();
        
        // MARKET orders: execute immediately at quoted price
        if (orderType == OrderType.MARKET) {
            if (side == OrderSide.BUY) {
                // Market buy: execute at ask price
                return ExecutionResult.filled(ask);
            } else if (side == OrderSide.SELL) {
                // Market sell: execute at bid price
                return ExecutionResult.filled(bid);
            } else {
                return ExecutionResult.rejected("Unknown order side: " + side);
            }
        }
        
        // LIMIT orders: check limit price constraint
        BigDecimal limitPrice = order.getLimitPrice();
        if (limitPrice == null) {
            return ExecutionResult.rejected("Order limit price is null");
        }
        
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
