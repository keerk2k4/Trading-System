package com.tradeexecutor.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;

/**
 * Trade event model for Trade Executor.
 * 
 * Represents events published by the executor (e.g., ORDER_FILLED, ORDER_REJECTED).
 * These events are published to the 'trade-events' topic and keyed by account ID.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TradeEvent {

    private Long orderId;
    private Long accountId;
    private String status;  // FILLED, REJECTED, etc.
    private BigDecimal executionPrice;
    private String reason;

    public TradeEvent() {
    }

    public TradeEvent(Long orderId, Long accountId, String status, BigDecimal executionPrice, String reason) {
        this.orderId = orderId;
        this.accountId = accountId;
        this.status = status;
        this.executionPrice = executionPrice;
        this.reason = reason;
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Long getAccountId() {
        return accountId;
    }

    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public BigDecimal getExecutionPrice() {
        return executionPrice;
    }

    public void setExecutionPrice(BigDecimal executionPrice) {
        this.executionPrice = executionPrice;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    @Override
    public String toString() {
        return "TradeEvent{" +
                "orderId=" + orderId +
                ", accountId=" + accountId +
                ", status='" + status + '\'' +
                ", executionPrice=" + executionPrice +
                ", reason='" + reason + '\'' +
                '}';
    }
}

