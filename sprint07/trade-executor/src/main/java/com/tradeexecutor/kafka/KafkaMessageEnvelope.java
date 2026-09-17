package com.tradeexecutor.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;

/**
 * Universal Kafka message envelope for all three topics (orders, trade-events, market-data).
 * 
 * This is a 5-field container that wraps topic-specific payloads. By using a single envelope
 * across all topics, the platform can implement one deserializer and one dead-letter handler.
 * 
 * Forward compatibility: all consumers MUST ignore unknown fields in the envelope and payload.
 * Use @JsonIgnoreProperties(ignoreUnknown = true) when deserializing.
 * 
 * @param <T> The payload type (OrderPlacedPayload, TradeEventPayload, QuotePayload, etc.)
 * 
 * Binding contract: contracts/kafka-topics.md, Message schemas section.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record KafkaMessageEnvelope<T>(
    @JsonProperty("eventId")
    @NotBlank(message = "eventId cannot be blank")
    String eventId,
    
    @JsonProperty("eventType")
    @NotBlank(message = "eventType cannot be blank")
    String eventType,
    
    @JsonProperty("eventTime")
    @NotBlank(message = "eventTime cannot be blank")
    String eventTime,
    
    @JsonProperty("source")
    @NotBlank(message = "source cannot be blank")
    String source,
    
    @JsonProperty("schemaVersion")
    @NotNull(message = "schemaVersion cannot be null")
    Integer schemaVersion,
    
    @JsonProperty("payload")
    @NotNull(message = "payload cannot be null")
    T payload
) {
    
    /**
     * Validates that schemaVersion is positive.
     */
    public KafkaMessageEnvelope {
        if (schemaVersion != null && schemaVersion < 1) {
            throw new IllegalArgumentException("schemaVersion must be >= 1, got: " + schemaVersion);
        }
    }
    
    /**
     * Known event sources in the trading system.
     */
    public enum Source {
        TRADE_API("trade-api"),
        TRADE_EXECUTOR("trade-executor"),
        MARKET_POLLER("market-poller");
        
        public final String value;
        
        Source(String value) {
            this.value = value;
        }
    }
    
    /**
     * Event types on the orders topic.
     */
    public enum OrderEventType {
        ORDER_PLACED("ORDER_PLACED");
        
        public final String value;
        
        OrderEventType(String value) {
            this.value = value;
        }
    }
    
    /**
     * Event types on the trade-events topic.
     */
    public enum TradeEventType {
        ORDER_FILLED("ORDER_FILLED"),
        ORDER_REJECTED("ORDER_REJECTED"),
        ORDER_CANCELLED("ORDER_CANCELLED");
        
        public final String value;
        
        TradeEventType(String value) {
            this.value = value;
        }
    }
    
    /**
     * Event types on the market-data topic.
     */
    public enum MarketEventType {
        QUOTE("QUOTE");
        
        public final String value;
        
        MarketEventType(String value) {
            this.value = value;
        }
    }
}
