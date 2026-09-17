package com.tradeexecutor.consumer;

import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import com.tradeexecutor.service.SettlementService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;
import com.tradeexecutor.kafka.KafkaMessageEnvelope;

/**
 * Kafka consumer for ORDER_PLACED events.
 * 
 * Consumes ORDER_PLACED events from the 'orders' topic.
 * - Consumer group: configured via spring.kafka.consumer.group-id
 * - For each event, passes to ExecutionService for processing
 * - After successful settlement and event publishing, acknowledges the Kafka message
 * 
 * Message flow:
 * 1. Receive ORDER_PLACED event from Kafka
 * 2. Execute the order (get execution result)
 * 3. Settle the order (update DB and publish event)
 * 4. Acknowledge Kafka message (only after event is published)
 */
@Component
public class OrderPlacedConsumer {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderPlacedConsumer.class);
    private static final String TOPIC = "orders";
    
    private final ExecutionService executionService;
    private final SettlementService settlementService;
    
    public OrderPlacedConsumer(ExecutionService executionService, SettlementService settlementService) {
        this.executionService = executionService;
        this.settlementService = settlementService;
    }
    
    /**
     * Consume ORDER_PLACED events from Kafka.
     * 
     * Kafka configuration:
     * - Topic: "orders"
    * - Consumer group: configured via spring.kafka.consumer.group-id
     * - Message: KafkaMessageEnvelope<OrderPlacedEvent> (JSON)
     * - Acknowledgment mode: MANUAL (acknowledge only after successful processing)
     * - Message Key: accountId (for per-account ordering)
     * 
     * @param envelope The ORDER_PLACED event envelope containing the order details
     * @param ack The Kafka acknowledgment (manual)
     */
    @KafkaListener(
        topics = TOPIC,
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderPlaced(@Payload KafkaMessageEnvelope<OrderPlacedEvent> envelope,
                             Acknowledgment ack) {
        logger.info("=== ORDER CONSUMPTION STARTED ===");
        logger.info("Kafka message received - Topic: {}", TOPIC);
        
        if (envelope == null || envelope.payload() == null) {
            logger.error("ERROR: Received null envelope or payload");
            if (ack != null) ack.acknowledge();
            return;
        }
        
        OrderPlacedEvent event = envelope.payload();
        logger.info("✓ Envelope deserialized successfully");
        logger.info("  Event Details:");
        logger.info("    - Event ID: {}", envelope.eventId());
        logger.info("    - Event Type: {}", envelope.eventType());
        logger.info("    - Source: {}", envelope.source());
        logger.info("    - Event Time: {}", envelope.eventTime());
        logger.info("  Order Details:");
        logger.info("    - Order ID: {}", event.getOrderId());
        logger.info("    - Account ID: {}", event.getAccountId());
        logger.info("    - Symbol: {}", event.getSymbol());
        logger.info("    - Side: {}", event.getSide());
        logger.info("    - Quantity: {}", event.getQuantity());
        logger.info("    - Price: {}", event.getPrice());
        logger.info("    - Idempotency Key: {}", event.getIdempotencyKey());
        logger.info("    - Created On: {}", event.getCreatedOn());

        try {
            logger.info("Processing order through ExecutionService...");
            // Step 1: Execute the order (determine FILLED or REJECTED)
            executionService.processOrderPlaced(event);
            
            logger.info("✓ Order execution completed successfully for order {}", event.getOrderId());
            logger.info("  Trade event has been published to 'trade-events' topic");

            if (ack != null) {
                ack.acknowledge();
                logger.info("✓ Kafka message acknowledged for order {}", event.getOrderId());
                logger.info("=== ORDER CONSUMPTION COMPLETED SUCCESSFULLY ===");
            }
        } catch (Exception e) {
            logger.error("✗ ERROR processing ORDER_PLACED event for order {}", event.getOrderId());
            logger.error("  Error Message: {}", e.getMessage());
            logger.error("  Stack Trace: ", e);
            logger.warn("  Message will NOT be acknowledged and will be retried from Kafka");
            // Do not acknowledge - message will be retried
            // Could optionally send to dead-letter queue depending on exception type
        }
    }
}

