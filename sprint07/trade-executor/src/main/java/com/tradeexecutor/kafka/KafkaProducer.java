package com.tradeexecutor.kafka;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * Kafka producer for publishing trade events and market data.
 * 
 * Publishes to:
 * - orders: ORDER_PLACED events from the REST API
 * - trade-events: ORDER_FILLED, ORDER_REJECTED, ORDER_CANCELLED from the executor
 * - market-data: QUOTE events from the market-data poller
 * 
 * Idempotent producer configuration ensures duplicate handling.
 */
@Component
public class KafkaProducer {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaProducer.class);
    
    private final KafkaTemplate<String, KafkaMessageEnvelope<?>> kafkaTemplate;
    
    public KafkaProducer(KafkaTemplate<String, KafkaMessageEnvelope<?>> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }
    
    /**
     * Publish a single quote to the market-data topic.
     * 
     * Called by the market-data poller for each symbol after batch fetching.
     * Message is keyed by symbol to ensure per-symbol ordering.
     * 
     * @param symbol The stock symbol (e.g., "AAPL")
     * @param payload The QuotePayload containing price data
     */
    public void publishQuote(String symbol, QuotePayload payload) {
        if (symbol == null || symbol.trim().isEmpty()) {
            logger.error("Cannot publish quote: symbol is null or empty");
            return;
        }
        
        if (payload == null) {
            logger.error("Cannot publish quote for {}: payload is null", symbol);
            return;
        }
        
        try {
            String eventId = UUID.randomUUID().toString();
            String nowIso = DateTimeFormatter.ISO_INSTANT.format(Instant.now());
            
            KafkaMessageEnvelope<QuotePayload> event = new KafkaMessageEnvelope<>(
                    eventId,
                    "QUOTE",
                    nowIso,
                    "market-poller",
                    1,
                    payload
            );
            
            // Publish keyed by symbol for per-symbol ordering
            kafkaTemplate.send("market-data", symbol, event);
            logger.debug("Published quote for {} to market-data topic", symbol);
            
        } catch (Exception e) {
            logger.error("Failed to publish quote for {}: {}", symbol, e.getMessage(), e);
        }
    }
}


