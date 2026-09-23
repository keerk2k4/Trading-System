package com.tradeexecutor.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

/**
 * Payload for QUOTE events on the market-data topic.
 * 
 * This represents a price quote polled from the Fauxnance API by the market-data poller
 * and published to all interested consumers (Portfolio, Watchlist, Advice, Strategy services).
 * 
 * Key: symbol (ensures per-symbol ordering)
 * Topic: market-data
 * Retention: 1 day
 * EventType: QUOTE
 * 
 * The quote contains bid/ask (prices at which trades can happen) and price (last observed trade).
 * Consumers fill orders at bid (for sells) and ask (for buys), not at price.
 * 
 * Binding contract: contracts/kafka-topics.md, "market-data" section.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record QuotePayload(
    @JsonProperty("symbol")
    @NotBlank(message = "symbol cannot be blank")
    String symbol,
    
    @JsonProperty("price")
    @NotNull(message = "price cannot be null")
    BigDecimal price,  // Last observed trade; nothing transacts here
    
    @JsonProperty("bid")
    @NotNull(message = "bid cannot be null")
    BigDecimal bid,  // Sell side of the quote, below price
    
    @JsonProperty("ask")
    @NotNull(message = "ask cannot be null")
    BigDecimal ask,  // Buy side of the quote, above price
    
    @JsonProperty("currency")
    @NotBlank(message = "currency cannot be blank")
    String currency,  // ISO 4217, e.g., "USD"
    
    @JsonProperty("change")
    BigDecimal change,  // Nullable: absolute change against previous close
    
    @JsonProperty("changePercent")
    BigDecimal changePercent,  // Nullable: 0.09 means 0.09 per cent
    
    @JsonProperty("previousClose")
    BigDecimal previousClose,  // Nullable: previous closing price
    
    @JsonProperty("marketState")
    @NotBlank(message = "marketState cannot be blank")
    String marketState,  // open | closed | pre | post | unknown
    
    @JsonProperty("stale")
    @NotNull(message = "stale cannot be null")
    Boolean stale,  // True when past freshness window
    
    @JsonProperty("quoteAsOf")
    @NotBlank(message = "quoteAsOf cannot be blank")
    String quoteAsOf  // Observation time from Fauxnance (RFC 3339), not poll time
) {
    
    /**
     * Market state values passed through from Fauxnance.
     */
    public enum MarketState {
        OPEN("open"),
        CLOSED("closed"),
        PRE("pre"),
        POST("post"),
        UNKNOWN("unknown");
        
        public final String value;
        
        MarketState(String value) {
            this.value = value;
        }
    }
}
