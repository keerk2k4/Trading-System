package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

/**
 * Payload for trade-events topic messages (ORDER_FILLED, ORDER_REJECTED, ORDER_CANCELLED).
 * 
 * This represents the outcome of order execution: either filled, rejected, or cancelled.
 * Sent by the Trade Executor after processing and publishing to multiple consumers
 * (Portfolio, Analytics, Notifications, Advice, etc.).
 * 
 * Key: accountId (ensures per-account ordering)
 * Topic: trade-events
 * Retention: 30 days
 * EventType: ORDER_FILLED | ORDER_REJECTED | ORDER_CANCELLED
 * 
 * Binding contract: contracts/kafka-topics.md, "trade-events" section.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TradeEventPayload(
    @JsonProperty("orderId")
    @NotBlank(message = "orderId cannot be blank")
    String orderId,
    
    @JsonProperty("accountId")
    @NotNull(message = "accountId cannot be null")
    Long accountId,
    
    @JsonProperty("symbol")
    @NotBlank(message = "symbol cannot be blank")
    String symbol,
    
    @JsonProperty("side")
    @NotBlank(message = "side cannot be blank")
    String side,
    
    @JsonProperty("quantity")
    @NotNull(message = "quantity cannot be null")
    @Positive(message = "quantity must be positive")
    Integer quantity,
    
    @JsonProperty("price")
    @NotNull(message = "price cannot be null")
    @Positive(message = "price must be positive")
    BigDecimal price,
    
    @JsonProperty("executedPrice")
    BigDecimal executedPrice,  // Nullable: null on reject and cancel
    
    @JsonProperty("status")
    @NotBlank(message = "status cannot be blank")
    String status,
    
    @JsonProperty("reason")
    String reason,  // Nullable: populated on reject and cancel
    
    @JsonProperty("cashDelta")
    @NotNull(message = "cashDelta cannot be null")
    BigDecimal cashDelta,
    
    @JsonProperty("positionQuantityAfter")
    @NotNull(message = "positionQuantityAfter cannot be null")
    Integer positionQuantityAfter,
    
    @JsonProperty("averageCostAfter")
    @NotNull(message = "averageCostAfter cannot be null")
    BigDecimal averageCostAfter,
    
    @JsonProperty("executedOn")
    @NotBlank(message = "executedOn cannot be blank")
    String executedOn
) {
    
    /**
     * Terminal status values for orders.
     */
    public enum Status {
        FILLED("FILLED"),
        REJECTED("REJECTED"),
        CANCELLED("CANCELLED");
        
        public final String value;
        
        Status(String value) {
            this.value = value;
        }
    }
    
    /**
     * Reasons for rejection or cancellation.
     * These match the exception types from the domain layer.
     */
    public enum Reason {
        INSUFFICIENT_FUNDS("INSUFFICIENT_FUNDS"),
        INSUFFICIENT_HOLDINGS("INSUFFICIENT_HOLDINGS"),
        PRICE_NOT_MET("PRICE_NOT_MET"),
        INSTRUMENT_NOT_TRADABLE("INSTRUMENT_NOT_TRADABLE"),
        ACCOUNT_NOT_ACTIVE("ACCOUNT_NOT_ACTIVE"),
        CANCELLED_BY_CUSTOMER("CANCELLED_BY_CUSTOMER"),
        QUOTE_UNAVAILABLE("QUOTE_UNAVAILABLE"),
        INVALID_ORDER("INVALID_ORDER");
        
        public final String value;
        
        Reason(String value) {
            this.value = value;
        }
    }
    
    /**
     * Side enumeration: BUY or SELL
     */
    public enum Side {
        BUY("BUY"),
        SELL("SELL");
        
        public final String value;
        
        Side(String value) {
            this.value = value;
        }
    }
}
