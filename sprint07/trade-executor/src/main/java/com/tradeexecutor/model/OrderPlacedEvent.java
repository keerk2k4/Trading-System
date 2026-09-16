package com.tradeexecutor.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;

/**
 * Event model for ORDER_PLACED Kafka message.
 * 
 * Represents the OrderPlaced event published by the Order Service
 * to the 'orders' Kafka topic.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderPlacedEvent {
    
    private Long orderId;
    private String symbol;
    private String side;          // "BUY" or "SELL"
    private Long quantity;
    private BigDecimal limitPrice;
    private Long accountId;
    private Long timestamp;
    
    // Default constructor for JSON deserialization
    public OrderPlacedEvent() {
    }
    
    public OrderPlacedEvent(Long orderId, String symbol, String side, Long quantity, 
                           BigDecimal limitPrice, Long accountId, Long timestamp) {
        this.orderId = orderId;
        this.symbol = symbol;
        this.side = side;
        this.quantity = quantity;
        this.limitPrice = limitPrice;
        this.accountId = accountId;
        this.timestamp = timestamp;
    }
    
    public Long getOrderId() {
        return orderId;
    }
    
    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }
    
    public String getSymbol() {
        return symbol;
    }
    
    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }
    
    public String getSide() {
        return side;
    }
    
    public void setSide(String side) {
        this.side = side;
    }
    
    public Long getQuantity() {
        return quantity;
    }
    
    public void setQuantity(Long quantity) {
        this.quantity = quantity;
    }
    
    public BigDecimal getLimitPrice() {
        return limitPrice;
    }
    
    public void setLimitPrice(BigDecimal limitPrice) {
        this.limitPrice = limitPrice;
    }
    
    public Long getAccountId() {
        return accountId;
    }
    
    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }
    
    public Long getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(Long timestamp) {
        this.timestamp = timestamp;
    }
    
    @Override
    public String toString() {
        return "OrderPlacedEvent{" +
                "orderId=" + orderId +
                ", symbol='" + symbol + '\'' +
                ", side='" + side + '\'' +
                ", quantity=" + quantity +
                ", limitPrice=" + limitPrice +
                ", accountId=" + accountId +
                ", timestamp=" + timestamp +
                '}';
    }
}
