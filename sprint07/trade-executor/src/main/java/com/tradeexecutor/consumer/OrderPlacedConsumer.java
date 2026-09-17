package com.tradeexecutor.consumer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
import com.tradeexecutor.kafka.DeadLetterPublisher;
import com.tradeexecutor.kafka.EventEnvelope;
import com.tradeexecutor.kafka.RetryHandler;
import com.tradeexecutor.model.OrderPlacedEvent;
import com.tradeexecutor.service.ExecutionService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Kafka consumer for ORDER_PLACED events from the 'orders' topic.
 *
 * Implements complete error handling including:
 * - Permanent failures: dead-letter immediately on first attempt
 * - Transient failures: retry with exponential backoff, then dead-letter after budget exhausted
 * - Poison message handling: no indefinite retries
 *
 * Behavior:
 * 1. Deserialize the message (envelope per contracts/kafka-topics.md, with raw fallback)
 *    - Malformed JSON → PermanentProcessingException → dead-letter immediately
 * 2. Validate the message
 *    - Missing orderId → PermanentProcessingException → dead-letter immediately
 *    - Unknown eventType → PermanentProcessingException → dead-letter immediately
 * 3. Process via ExecutionService
 *    - Order not found → PermanentProcessingException → dead-letter immediately
 *    - Broker unreachable → TransientProcessingException → retry with backoff
 *    - DB connection lost → TransientProcessingException → retry with backoff
 *    - Optimistic lock exhausted → TransientProcessingException → retry with backoff
 * 4. Commit offset (MANUAL ack mode)
 *    - Permanent failure → dead-letter, then acknowledge (message won't be redelivered)
 *    - Transient failure (budgeted) → don't acknowledge, message redelivered for next attempt
 *    - Transient failure (budget exhausted) → dead-letter, then acknowledge
 *    - Success → acknowledge (normal path)
 *
 * Dead-lettering:
 * - Topic: orders.DLT
 * - Message value: original Kafka message (as bytes)
 * - Failure reason: in x-failure-reason header
 * - Message key: preserved from original message
 * - Attempt count: tracked in x-retry-count header
 */
@Component
public class OrderPlacedConsumer {

    private static final Logger logger = LoggerFactory.getLogger(OrderPlacedConsumer.class);
    private static final String TOPIC = "orders";
    private static final String CONSUMER_GROUP = "trade-executor";

    private final ExecutionService executionService;
    private final DeadLetterPublisher deadLetterPublisher;
    private final RetryHandler retryHandler;
    private final ObjectMapper objectMapper;

    public OrderPlacedConsumer(
            ExecutionService executionService,
            DeadLetterPublisher deadLetterPublisher,
            RetryHandler retryHandler,
            ObjectMapper objectMapper) {
        this.executionService = executionService;
        this.deadLetterPublisher = deadLetterPublisher;
        this.retryHandler = retryHandler;
        this.objectMapper = objectMapper;
    }

    /**
     * Consume ORDER_PLACED events from Kafka.
     *
     * Kafka configuration:
     * - Topic: "orders"
     * - Consumer group: "trade-executor"
     * - Message: OrderPlacedEvent JSON, wrapped in EventEnvelope per contracts/kafka-topics.md
     *   (raw OrderPlacedEvent JSON is also accepted for backward compatibility / tests)
     * - Manual offset commit: acknowledge only after the DLT decision is made
     *
     * @param record The ConsumerRecord containing the ORDER_PLACED event
     * @param ack Manual acknowledgment (may be null in tests)
     */
    @KafkaListener(
        topics = TOPIC,
        groupId = CONSUMER_GROUP,
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderPlaced(ConsumerRecord<String, byte[]> record, Acknowledgment ack) {
        String messageKey = record.key();
        byte[] messageValue = record.value();
        org.apache.kafka.common.header.Headers headers = record.headers();

        logger.debug("Received message from topic '{}' with key '{}' and offset {}",
            TOPIC, messageKey, record.offset());

        try {
            // Step 1: Deserialize the message (envelope-aware, raw fallback)
            OrderPlacedEvent event = deserializeMessage(messageValue);

            // Step 2: Process the event (may throw Permanent or Transient exception)
            executionService.processOrderPlaced(event);

            // Step 3: Success - acknowledge so the offset is committed
            logger.info("Successfully processed ORDER_PLACED for order {}", event.getOrderId());
            if (ack != null) {
                ack.acknowledge();
            }

        } catch (PermanentProcessingException e) {
            // Permanent failure: dead-letter immediately, then acknowledge
            handlePermanentFailure(TOPIC, messageKey, messageValue, headers, e);
            if (ack != null) {
                ack.acknowledge();
            }

        } catch (TransientProcessingException e) {
            // Transient failure: retry with backoff or dead-letter if budget exhausted.
            // handleTransientFailure rethrows when a retry is due (no ack → redelivery).
            // When budget is exhausted it dead-letters and returns (ack below).
            boolean retried = handleTransientFailure(TOPIC, messageKey, messageValue, headers, e);
            if (!retried && ack != null) {
                ack.acknowledge();
            }
        }
    }

    /**
     * Backward-compatible overload without manual acknowledgment (used in unit tests).
     *
     * @param record The ConsumerRecord containing the ORDER_PLACED event
     */
    public void onOrderPlaced(ConsumerRecord<String, byte[]> record) {
        onOrderPlaced(record, null);
    }

    /**
     * Deserialize a message from bytes.
     *
     * Accepts the contract envelope {@code EventEnvelope<OrderPlacedEvent>} and,
     * for backward compatibility, a raw {@code OrderPlacedEvent} body.
     *
     * @param messageBytes The raw message bytes
     * @return The deserialized OrderPlacedEvent payload
     * @throws PermanentProcessingException if deserialization fails (malformed JSON)
     *         or the envelope carries an unexpected eventType
     */
    private OrderPlacedEvent deserializeMessage(byte[] messageBytes) {
        if (messageBytes == null || messageBytes.length == 0) {
            throw new PermanentProcessingException(
                "Received null or empty message body"
            );
        }

        String json = new String(messageBytes, StandardCharsets.UTF_8);

        // Try contract envelope first: {"eventType":"ORDER_PLACED", ..., "payload":{...}}
        try {
            EventEnvelope<OrderPlacedEvent> envelope = objectMapper.readValue(
                json,
                new TypeReference<EventEnvelope<OrderPlacedEvent>>() {
                });
            if (envelope != null && envelope.getPayload() != null) {
                String eventType = envelope.getEventType();
                if (eventType != null && !eventType.isEmpty()
                        && !"ORDER_PLACED".equals(eventType)) {
                    throw new PermanentProcessingException(
                        "Unexpected eventType: " + eventType + ", expected ORDER_PLACED"
                    );
                }
                return envelope.getPayload();
            }
        } catch (PermanentProcessingException e) {
            throw e;
        } catch (Exception ignored) {
            // Not an envelope (or malformed) — fall through to raw parsing below,
            // which produces the canonical "Malformed JSON" error when appropriate.
        }

        try {
            OrderPlacedEvent event = objectMapper.readValue(json, OrderPlacedEvent.class);

            if (event == null) {
                throw new PermanentProcessingException(
                    "Failed to deserialize OrderPlacedEvent: result is null"
                );
            }

            return event;

        } catch (PermanentProcessingException e) {
            throw e;
        } catch (Exception e) {
            // JSON parsing error, malformed message
            throw new PermanentProcessingException(
                "Malformed JSON in ORDER_PLACED message: " + e.getMessage(),
                e
            );
        }
    }

    /**
     * Handle a permanent failure.
     *
     * A message that fails permanently will never succeed, so:
     * 1. Publish to dead-letter topic with failure reason
     * 2. Log the error
     * 3. Caller acknowledges (commit offset) so it's not redelivered
     *
     * @param topic The original topic
     * @param messageKey The message key
     * @param messageValue The raw message bytes
     * @param headers The original message headers
     * @param exception The exception that was thrown
     */
    private void handlePermanentFailure(
            String topic,
            String messageKey,
            byte[] messageValue,
            org.apache.kafka.common.header.Headers headers,
            PermanentProcessingException exception) {

        String failureReason = exception.getFailureReason();
        logger.error("Permanent processing failure for message with key '{}': {}",
            messageKey, failureReason);

        // Publish to dead-letter topic
        deadLetterPublisher.publishToDeadLetter(
            topic,
            messageKey,
            messageValue,
            failureReason,
            headers
        );

        // Caller acknowledges after dead-lettering.
    }

    /**
     * Handle a transient failure.
     *
     * A message that fails transiently may succeed later, so:
     * 1. Check if we should retry (retry count &lt; max and backoff elapsed)
     *    - If yes: rethrow so Spring Kafka redelivers (do NOT acknowledge)
     *    - If no: publish to dead-letter topic and let caller acknowledge
     *
     * @param topic The original topic
     * @param messageKey The message key
     * @param messageValue The raw message bytes
     * @param headers The original message headers
     * @param exception The exception that was thrown
     * @return true if the message will be retried (exception rethrown), false if dead-lettered
     */
    private boolean handleTransientFailure(
            String topic,
            String messageKey,
            byte[] messageValue,
            org.apache.kafka.common.header.Headers headers,
            TransientProcessingException exception) {

        String failureReason = exception.getFailureReason();
        int currentRetryCount = retryHandler.getRetryCount(headers);

        logger.warn("Transient processing failure for message with key '{}' (attempt {}): {}",
            messageKey, currentRetryCount + 1, failureReason);

        // Check if we should retry
        if (retryHandler.shouldRetry(headers)) {
            logger.debug("Will retry message with key '{}'. Current retry count: {}",
                messageKey, currentRetryCount);

            // Don't acknowledge - message will be redelivered.
            // Rethrowing signals Spring Kafka not to commit the offset.
            throw exception;

        } else {
            // Retry budget exhausted: dead-letter and let caller acknowledge
            String exhaustedReason = retryHandler.formatRetryExhaustedFailureReason(failureReason);
            logger.error("Transient failure retry budget exhausted for message with key '{}': {}",
                messageKey, exhaustedReason);

            // Publish to dead-letter topic
            deadLetterPublisher.publishToDeadLetter(
                topic,
                messageKey,
                messageValue,
                exhaustedReason,
                headers
            );

            return false;
        }
    }
}
