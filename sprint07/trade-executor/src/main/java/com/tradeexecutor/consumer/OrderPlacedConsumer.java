package com.tradeexecutor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.exception.ExecutionException;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.KafkaMessageEnvelope;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import com.tradeexecutor.service.SettlementService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

/**
 * Kafka consumer for ORDER_PLACED events with DLT failure handling.
 * 
 * Consumes ORDER_PLACED events from the 'orders' topic with sophisticated failure handling:
 * 
 * PERMANENT FAILURES (no retry):
 * - Malformed JSON or deserialization error
 * - Missing required fields (orderId, accountId)
 * - Order or instrument not found in database
 * - Invalid field values
 * → Immediately dead-lettered to orders.DLT with failure reason
 * 
 * TRANSIENT FAILURES (retry with backoff):
 * - Database connection lost or timeout
 * - Kafka broker unreachable
 * - Optimistic lock retry budget exhausted
 * → Retried with exponential backoff up to max attempts
 * → Dead-lettered to orders.DLT if all retries exhausted
 * 
 * SUCCESS:
 * → Kafka message acknowledged
 * → NOT sent to DLT
 * 
 * Message flow:
 * 1. Receive ORDER_PLACED event from Kafka (deserialized via JsonMessageConverter)
 * 2. Classify failure type (permanent/transient) via exception handling
 * 3. For PERMANENT: dead-letter immediately
 * 4. For TRANSIENT: retry with exponential backoff
 * 5. For SUCCESS: acknowledge Kafka message
 */
@Component
public class OrderPlacedConsumer {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderPlacedConsumer.class);
    private static final String TOPIC = "orders";
    
    private final ExecutionService executionService;
    private final SettlementService settlementService;
    private final DeadLetterPublisher deadLetterPublisher;
    private final RetryHandler retryHandler;
    private final ObjectMapper objectMapper;
    
    public OrderPlacedConsumer(ExecutionService executionService, SettlementService settlementService,
                               DeadLetterPublisher deadLetterPublisher, RetryHandler retryHandler,
                               ObjectMapper objectMapper) {
        this.executionService = executionService;
        this.settlementService = settlementService;
        this.deadLetterPublisher = deadLetterPublisher;
        this.retryHandler = retryHandler;
        this.objectMapper = objectMapper;
    }
    
    /**
     * Consume ORDER_PLACED events from Kafka with DLT failure handling.
     * 
     * Behavior:
     * 1. Try to process the order
     * 2. If PERMANENT error: dead-letter immediately, acknowledge
     * 3. If TRANSIENT error: retry with backoff, dead-letter if exhausted, acknowledge
     * 4. If SUCCESS: acknowledge without going to DLT
     * 
     * The message is ALWAYS acknowledged at the end so it doesn't block the partition.
     * 
     * @param record The raw Kafka ConsumerRecord (provides key and raw bytes)
     * @param envelope The deserialized ORDER_PLACED event envelope
     * @param ack The Kafka acknowledgment (manual)
     */
    @KafkaListener(
        topics = TOPIC,
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderPlaced(ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> record,
                             @Payload KafkaMessageEnvelope<OrderPlacedEvent> envelope,
                             Acknowledgment ack) {
        logger.info("=== ORDER CONSUMPTION STARTED ===");
        logger.info("Kafka message received - Topic: {}, Partition: {}, Offset: {}", 
                   TOPIC, record.partition(), record.offset());
        
        // Handle deserialization errors (malformed JSON) as permanent failure
        if (envelope == null || envelope.payload() == null) {
            logger.error("✗ PERMANENT ERROR: Received null envelope or payload");
            handlePermanentFailure(record, "Null envelope or payload", ack);
            return;
        }
        
        OrderPlacedEvent event = envelope.payload();
        logger.info("✓ Envelope deserialized successfully");
        logger.info("  Event ID: {}, Event Type: {}, Order ID: {}", 
                   envelope.eventId(), envelope.eventType(), event.getOrderId());
        
        // Try to process with retry logic for transient failures
        processWithRetry(event, record, ack);
    }
    
    /**
     * Process order with retry logic for transient failures.
     * 
     * @param event The order placed event
     * @param record The raw Kafka message
     * @param ack The acknowledgment
     */
    private void processWithRetry(OrderPlacedEvent event, ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> record,
                                  Acknowledgment ack) {
        int attemptNumber = 0;
        ExecutionException lastException = null;
        
        while (true) {
            attemptNumber++;
            logger.info("Processing order: attempt {}/{}", attemptNumber, retryHandler.getMaxRetries());
            
            try {
                // Try to execute and settle the order
                executionService.processOrderPlaced(event);
                
                logger.info("✓ Order execution completed successfully");
                if (ack != null) {
                    ack.acknowledge();
                    logger.info("✓ Kafka message acknowledged");
                }
                logger.info("=== ORDER CONSUMPTION COMPLETED SUCCESSFULLY ===");
                return;  // SUCCESS - exit
                
            } catch (ExecutionException e) {
                // Execution exception - we classified it
                lastException = e;
                
                if (!e.isRetryable()) {
                    // PERMANENT failure
                    logger.error("✗ PERMANENT ERROR: {}", e.getFailureReason());
                    handlePermanentFailure(record, e.getFailureReason(), ack);
                    return;  // Exit after DLT
                }
                
                // TRANSIENT failure
                if (!retryHandler.shouldRetry(attemptNumber)) {
                    // Retry budget exhausted
                    logger.error("✗ TRANSIENT ERROR - Retry budget exhausted after {} attempts: {}", 
                               attemptNumber, e.getFailureReason());
                    handleTransientFailureExhausted(record, e.getFailureReason(), ack);
                    return;  // Exit after DLT
                }
                
                // Retry with backoff
                logger.warn("⟲ TRANSIENT ERROR - Retrying in {}ms: {}", 
                           retryHandler.calculateBackoffMs(attemptNumber), e.getMessage());
                retryHandler.waitForBackoff(attemptNumber);
                // Loop to retry
                
            } catch (Exception e) {
                // Unexpected exception - classify as transient to be safe
                logger.error("✗ UNEXPECTED ERROR: {}", e.getMessage(), e);
                
                if (!retryHandler.shouldRetry(attemptNumber)) {
                    // Retry budget exhausted
                    handleTransientFailureExhausted(record, "TRANSIENT: " + e.getMessage(), ack);
                    return;
                }
                
                // Retry with backoff
                logger.warn("⟲ Retrying in {}ms", retryHandler.calculateBackoffMs(attemptNumber));
                retryHandler.waitForBackoff(attemptNumber);
                // Loop to retry
            }
        }
    }
    
    /**
     * Handle permanent failures - dead-letter immediately.
     * 
     * @param record The Kafka message to dead-letter
     * @param failureReason Human-readable failure description
     * @param ack The acknowledgment to mark message as processed
     */
    private void handlePermanentFailure(ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> record,
                                       String failureReason, Acknowledgment ack) {
        logger.info("Sending message to DLT: {}", failureReason);
        try {
            byte[] messageBytes = objectMapper.writeValueAsBytes(record.value());
            deadLetterPublisher.publishToDeadLetter(
                TOPIC,
                record.key(),
                messageBytes,
                failureReason
            );
        } catch (Exception e) {
            logger.error("✗ Failed to serialize message for DLT: {}", e.getMessage(), e);
        }
        
        if (ack != null) {
            ack.acknowledge();
            logger.info("✓ Message acknowledged after DLT");
        }
        logger.info("=== ORDER CONSUMPTION COMPLETED WITH PERMANENT FAILURE → DLT ===");
    }
    
    /**
     * Handle transient failures where retry budget is exhausted.
     * 
     * @param record The Kafka message to dead-letter
     * @param failureReason Human-readable failure description
     * @param ack The acknowledgment to mark message as processed
     */
    private void handleTransientFailureExhausted(ConsumerRecord<String, KafkaMessageEnvelope<OrderPlacedEvent>> record,
                                                String failureReason, Acknowledgment ack) {
        logger.info("Sending message to DLT after retry exhaustion: {}", failureReason);
        try {
            byte[] messageBytes = objectMapper.writeValueAsBytes(record.value());
            deadLetterPublisher.publishToDeadLetter(
                TOPIC,
                record.key(),
                messageBytes,
                failureReason
            );
        } catch (Exception e) {
            logger.error("✗ Failed to serialize message for DLT: {}", e.getMessage(), e);
        }
        
        if (ack != null) {
            ack.acknowledge();
            logger.info("✓ Message acknowledged after DLT");
        }
        logger.info("=== ORDER CONSUMPTION COMPLETED WITH TRANSIENT FAILURE → DLT (RETRIES EXHAUSTED) ===");
    }
}

