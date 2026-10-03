package com.tradeexecutor.execution;

import java.math.BigDecimal;

/**
 * Encapsulates the result of executing an order.
 * 
 * Represents the outcome of order execution including fills, rejections,
 * or errors (e.g., pricing unavailable).
 */
public class ExecutionResult {
    
    public enum Status {
        FILLED,                    // Order was successfully filled
        REJECTED,                  // Order rejected (price out of range)
        PRICING_UNAVAILABLE,       // Unable to obtain quote after retry budget exhausted
        INSTRUMENT_NOT_TRADABLE    // Instrument is not tradable
    }
    
    private final Status status;
    private final BigDecimal executionPrice;  // Price at which order was filled (null if not FILLED)
    private final String reason;              // Additional context/error description
    
    public ExecutionResult(Status status, BigDecimal executionPrice, String reason) {
        this.status = status;
        this.executionPrice = executionPrice;
        this.reason = reason;
    }
    
    public static ExecutionResult filled(BigDecimal executionPrice) {
        return new ExecutionResult(Status.FILLED, executionPrice, "Order filled at quote price");
    }
    
    public static ExecutionResult rejected(String reason) {
        return new ExecutionResult(Status.REJECTED, null, reason);
    }
    
    public static ExecutionResult pricingUnavailable(String reason) {
        return new ExecutionResult(Status.PRICING_UNAVAILABLE, null, reason);
    }
    
    public static ExecutionResult instrumentNotTradable(String reason) {
        return new ExecutionResult(Status.INSTRUMENT_NOT_TRADABLE, null, reason);
    }
    
    public Status getStatus() {
        return status;
    }
    
    public BigDecimal getExecutionPrice() {
        return executionPrice;
    }
    
    public String getReason() {
        return reason;
    }
    
    @Override
    public String toString() {
        return "ExecutionResult{" +
                "status=" + status +
                ", executionPrice=" + executionPrice +
                ", reason='" + reason + '\'' +
                '}';
    }
}

