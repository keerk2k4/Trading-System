package com.tradeexecutor.kafka;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Publishes messages to dead-letter topics.
 * 
 * When a message fails processing with no recovery path, it is sent to a dead-letter topic
 * named <topic>.DLT. The original message is preserved as the value, and the failure reason
 * is stored in a Kafka header.
 * 
 * Behavior:
 * - DLT topic name: "{original_topic}.DLT"
 * - DLT message value: Original Kafka message (as bytes)
 * - Failure reason: Stored in "x-failure-reason" header
 * - Message key: Preserved from original message (if present)
 */
@Component
public class DeadLetterPublisher {
    
    private static final Logger logger = LoggerFactory.getLogger(DeadLetterPublisher.class);
    private static final String DLT_SUFFIX = ".DLT";
    private static final String FAILURE_REASON_HEADER = "x-failure-reason";
    
    private final KafkaTemplate<String, byte[]> kafkaTemplate;
    
    public DeadLetterPublisher(KafkaTemplate<String, byte[]> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }
    
    /**
     * Publish a message to the dead-letter topic.
     * 
     * @param originalTopic The original topic the message came from (e.g., "orders")
     * @param messageKey The original message key (nullable)
     * @param messageValue The original message value as bytes
     * @param failureReason Human-readable reason for dead-lettering
     * @param originalHeaders Original Kafka headers from the failed message (for context)
     */
    public void publishToDeadLetter(
            String originalTopic,
            String messageKey,
            byte[] messageValue,
            String failureReason,
            org.apache.kafka.common.header.Headers originalHeaders) {
        
        String dltTopic = originalTopic + DLT_SUFFIX;
        
        try {
            // Create headers for the DLT message
            List<Header> headers = new ArrayList<>();
            
            // Add the failure reason header
            headers.add(new RecordHeader(
                FAILURE_REASON_HEADER,
                failureReason.getBytes(StandardCharsets.UTF_8)
            ));
            
            // Preserve original headers if present
            if (originalHeaders != null) {
                for (Header originalHeader : originalHeaders) {
                    // Don't duplicate the failure reason header
                    if (!originalHeader.key().equals(FAILURE_REASON_HEADER)) {
                        headers.add(originalHeader);
                    }
                }
            }
            
            // Create the producer record with the DLT topic and original message
            ProducerRecord<String, byte[]> record = new ProducerRecord<>(
                dltTopic,
                null,  // partition (let Kafka choose based on key)
                messageKey,
                messageValue,
                headers
            );
            
            // Send to DLT
            kafkaTemplate.send(record)
                .thenAccept(result -> logger.info(
                    "Dead-lettered message from topic '{}' to '{}' with key '{}'. Reason: {}",
                    originalTopic, dltTopic, messageKey, failureReason))
                .exceptionally(ex -> {
                    logger.error(
                        "Failed to publish message to dead-letter topic '{}'. Reason: {}",
                        dltTopic, failureReason, ex);
                    return null;
                });
            
        } catch (Exception e) {
            logger.error(
                "Exception while publishing to dead-letter topic '{}'. Reason: {}",
                dltTopic, failureReason, e);
        }
    }
}
