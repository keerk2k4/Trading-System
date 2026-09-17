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
import com.tradeexecutor.kafka.EventEnvelope;

/**
 * Kafka consumer for ORDER_PLACED events.
 * 
 * Consumes ORDER_PLACED events from the 'orders' topic.
 * - Consumer group: "trade-executor"
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
    private static final String CONSUMER_GROUP = "trade-executor";
    
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
     * - Consumer group: "trade-executor"
     * - Message: OrderPlacedEvent (JSON)
     * - Acknowledgment mode: MANUAL (acknowledge only after successful processing)
     * 
     * @param envelope The ORDER_PLACED event envelope
     * @param ack The Kafka acknowledgment (manual)
     */
    @KafkaListener(
        topics = TOPIC,
        groupId = CONSUMER_GROUP,
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderPlaced(@Payload EventEnvelope<OrderPlacedEvent> envelope,
                             Acknowledgment ack) {
        OrderPlacedEvent event = envelope.getPayload();
        logger.info("Received ORDER_PLACED event: {}", event);

        try {
            // Step 1: Execute the order (determine FILLED or REJECTED)
            executionService.processOrderPlaced(event);
            logger.info("Successfully processed ORDER_PLACED for order {}", event.getOrderId());

            if (ack != null) {
                ack.acknowledge();
                logger.debug("Acknowledged ORDER_PLACED event for order {}", event.getOrderId());
            }
        } catch (Exception e) {
            logger.error("Error processing ORDER_PLACED event for order {}: {}",
                event.getOrderId(), e.getMessage(), e);
            // Do not acknowledge - message will be retried
            // Could optionally send to dead-letter queue depending on exception type
        }
    }
}

