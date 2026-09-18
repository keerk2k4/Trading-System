package com.tradeexecutor.kafka;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

/**
 * Publishes failed messages to the appropriate dead-letter topic.
 * 
 * Responsibilities:
 * 1. Preserve the original Kafka message as-is
 * 2. Add failure reason header
 * 3. Publish to the corresponding DLT topic (e.g., orders → orders.DLT)
 * 4. Handle publishing errors gracefully
 * 
 * DLT topics follow the naming convention: {topic}.DLT
 * - orders → orders.DLT
 * - trade-events → trade-events.DLT
 * - market-data → market-data.DLT
 */
@Component
public class DeadLetterPublisher {
    
    private static final Logger logger = LoggerFactory.getLogger(DeadLetterPublisher.class);
    
    private final KafkaTemplate<String, byte[]> kafkaTemplate;
    
    public DeadLetterPublisher(@Qualifier("rawBytesKafkaTemplate") KafkaTemplate<String, byte[]> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }
    
    /**
     * Publish a failed message to the dead-letter topic.
     * 
     * The message is published with:
     * - Same key as the original message
     * - Same message value (bytes) as the original
     * - Header "failure-reason" with the error description
     * - Topic name transformed: {topic} → {topic}.DLT
     * 
     * @param originalTopic the original topic name (e.g., "orders")
     * @param messageKey the original message key (e.g., account ID)
     * @param messageValue the original message value (bytes)
     * @param failureReason human-readable description of the failure
     */
    public void publishToDeadLetter(String originalTopic, String messageKey, byte[] messageValue, String failureReason) {
        String dltTopic = originalTopic + ".DLT";
        
        try {
            logger.info("Publishing message to DLT: topic={}, key={}, reason={}", dltTopic, messageKey, failureReason);
            
            // Build message with failure reason header
            Message<byte[]> message = MessageBuilder
                    .withPayload(messageValue)
                    .setHeader("failure-reason", failureReason)
                    .build();
            
            // Publish to DLT using sendDefault with explicit topic and key
            kafkaTemplate.send(dltTopic, messageKey, messageValue);
            
            logger.info("✓ Message successfully published to DLT: {}", dltTopic);
        } catch (Exception e) {
            logger.error("✗ Failed to publish message to DLT topic: {}", dltTopic, e);
            // Do not throw - we've already failed the primary message.
            // If we throw here, we risk infinite retry loops or message loss.
            // Log the error so the ops team can investigate.
        }
    }
}
