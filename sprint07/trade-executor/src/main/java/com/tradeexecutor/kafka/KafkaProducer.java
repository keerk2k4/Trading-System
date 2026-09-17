package com.tradeexecutor.kafka;

import com.tradeexecutor.model.TradeEvent;
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
    
    /**
     * Publish a trade event to the trade-events topic.
     * 
     * Called after successful order settlement (filled or rejected).
     * Message is keyed by account ID to ensure per-account ordering.
     * 
     * @param accountId The account ID as string (for keying)
     * @param tradeEvent The TradeEvent containing order settlement information
     */
    public void publishTradeEvent(String accountId, TradeEvent tradeEvent) {
        logger.info("=== KAFKA PRODUCER: Publishing Trade Event ===");
        
        if (accountId == null || accountId.trim().isEmpty()) {
            logger.error("ERROR: Cannot publish trade event - accountId is null or empty");
            return;
        }
        
        if (tradeEvent == null) {
            logger.error("ERROR: Cannot publish trade event - payload is null");
            return;
        }
        
        try {
            logger.info("Creating KafkaMessageEnvelope...");
            String eventId = UUID.randomUUID().toString();
            String nowIso = DateTimeFormatter.ISO_INSTANT.format(Instant.now());
            
            logger.info("  Event ID: {}", eventId);
            logger.info("  Event Time: {}", nowIso);
            logger.info("  Source: trade-executor");
            logger.info("  Schema Version: 1");
            
            // Determine event type based on status
            String eventType;
            if ("FILLED".equals(tradeEvent.getStatus())) {
                eventType = "ORDER_FILLED";
            } else if ("REJECTED".equals(tradeEvent.getStatus())) {
                eventType = "ORDER_REJECTED";
            } else {
                eventType = "ORDER_" + tradeEvent.getStatus();
            }
            
            logger.info("  Event Type: {}", eventType);
            logger.info("  Payload:");
            logger.info("    - Order ID: {}", tradeEvent.getOrderId());
            logger.info("    - Account ID: {}", tradeEvent.getAccountId());
            logger.info("    - Status: {}", tradeEvent.getStatus());
            logger.info("    - Execution Price: {}", tradeEvent.getExecutionPrice());
            logger.info("    - Reason: {}", tradeEvent.getReason());
            
            KafkaMessageEnvelope<TradeEvent> event = new KafkaMessageEnvelope<>(
                    eventId,
                    eventType,
                    nowIso,
                    "trade-executor",
                    1,
                    tradeEvent
            );
            
            // Publish keyed by account ID for per-account ordering
            logger.info("Sending message to Kafka topic 'trade-events'...");
            logger.info("  Message Key: {} (Account ID)", accountId);
            kafkaTemplate.send("trade-events", accountId, event);
            
            logger.info("✓ Trade event published successfully!");
            logger.info("  - Topic: trade-events");
            logger.info("  - Event Type: {}", eventType);
            logger.info("  - Order ID: {}", tradeEvent.getOrderId());
            logger.info("=== KAFKA PRODUCER: Trade Event Publication Complete ===");
            
        } catch (Exception e) {
            logger.error("✗ FAILED to publish trade event");
            logger.error("  Error: {}", e.getMessage());
            logger.error("  Stack trace: ", e);
            throw new RuntimeException("Failed to publish trade event", e);
        }
    }
}


