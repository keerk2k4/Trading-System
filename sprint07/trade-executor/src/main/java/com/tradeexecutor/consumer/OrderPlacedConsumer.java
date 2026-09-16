package com.tradeexecutor.consumer;

import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Kafka consumer for ORDER_PLACED events.
 * 
 * Consumes ORDER_PLACED events from the 'orders' topic.
 * - Consumer group: "trade-executor"
 * - For each event, passes to ExecutionService for processing
 */
@Component
public class OrderPlacedConsumer {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderPlacedConsumer.class);
    private static final String TOPIC = "orders";
    private static final String CONSUMER_GROUP = "trade-executor";
    
    private final ExecutionService executionService;
    
    public OrderPlacedConsumer(ExecutionService executionService) {
        this.executionService = executionService;
    }
    
    /**
     * Consume ORDER_PLACED events from Kafka.
     * 
     * Kafka configuration:
     * - Topic: "orders"
     * - Consumer group: "trade-executor"
     * - Message: OrderPlacedEvent (JSON)
     * 
     * @param event The ORDER_PLACED event
     */
    @KafkaListener(
        topics = TOPIC,
        groupId = CONSUMER_GROUP,
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderPlaced(OrderPlacedEvent event) {
        logger.info("Received ORDER_PLACED event: {}", event);
        
        try {
            executionService.processOrderPlaced(event);
            logger.info("Successfully processed ORDER_PLACED for order {}", event.getOrderId());
        } catch (Exception e) {
            logger.error("Error processing ORDER_PLACED event for order {}: {}", 
                event.getOrderId(), e.getMessage(), e);
            // Note: Kafka will retry based on error handler configuration
        }
    }
}

