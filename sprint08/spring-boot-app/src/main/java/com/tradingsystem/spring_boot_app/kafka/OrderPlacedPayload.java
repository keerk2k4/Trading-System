package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

/**
 * Payload for ORDER_PLACED events on the orders topic.
 * 
 * This represents an order accepted by the Trade REST API and published to the orders topic
 * for the Trade Executor to consume and execute.
 * 
 * Key: accountId (ensures per-account ordering)
 * Topic: orders
 * Retention: 7 days
 * EventType: ORDER_PLACED
 * 
 * Binding contract: contracts/kafka-topics.md, "orders" section.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OrderPlacedPayload(
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
    
    @JsonProperty("idempotencyKey")
    @NotBlank(message = "idempotencyKey cannot be blank")
    String idempotencyKey,
    
    @JsonProperty("createdOn")
    @NotBlank(message = "createdOn cannot be blank")
    String createdOn
) {
    
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
