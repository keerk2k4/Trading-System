package com.tradeexecutor.kafka;

import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Manages retry logic for transient message processing failures.
 * 
 * When a message fails with a transient error, it is retried with exponential backoff.
 * The retry count and next-retry-time are tracked in Kafka headers to survive failures.
 * 
 * Configuration:
 * - app.retry.max-attempts: Maximum number of retries (default: 3)
 * - app.retry.initial-delay-ms: Initial backoff delay in milliseconds (default: 100)
 * - app.retry.max-delay-ms: Maximum backoff delay in milliseconds (default: 30000)
 * - app.retry.backoff-multiplier: Exponential backoff multiplier (default: 2.0)
 * 
 * Behavior:
 * - First attempt: no delay
 * - Retry 1: initialDelay ms
 * - Retry 2: initialDelay * multiplier ms
 * - Retry 3: initialDelay * multiplier^2 ms (capped at maxDelay)
 * - After max attempts exhausted: mark for dead-lettering
 */
@Component
public class RetryHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(RetryHandler.class);
    
    private static final String RETRY_COUNT_HEADER = "x-retry-count";
    private static final String NEXT_RETRY_TIME_HEADER = "x-next-retry-time";
    private static final String ORIGINAL_ATTEMPT_TIME_HEADER = "x-original-attempt-time";
    
    @Value("${app.retry.max-attempts:3}")
    private int maxRetryAttempts;
    
    @Value("${app.retry.initial-delay-ms:100}")
    private long initialDelayMs;
    
    @Value("${app.retry.max-delay-ms:30000}")
    private long maxDelayMs;
    
    @Value("${app.retry.backoff-multiplier:2.0}")
    private double backoffMultiplier;
    
    /**
     * Get the current retry count from message headers.
     * 
     * @param headers Kafka message headers
     * @return Retry count (0 if not present)
     */
    public int getRetryCount(org.apache.kafka.common.header.Headers headers) {
        if (headers == null) {
            return 0;
        }
        
        Header retryCountHeader = headers.lastHeader(RETRY_COUNT_HEADER);
        if (retryCountHeader == null) {
            return 0;
        }
        
        try {
            String value = new String(retryCountHeader.value(), StandardCharsets.UTF_8);
            return Integer.parseInt(value);
        } catch (Exception e) {
            logger.warn("Failed to parse retry count header", e);
            return 0;
        }
    }
    
    /**
     * Check if a message should be retried.
     * 
     * A message should be retried if:
     * 1. The retry count is less than maxRetryAttempts
     * 2. The current time is past the nextRetryTime (or nextRetryTime is not set)
     * 
     * @param headers Kafka message headers
     * @return true if the message should be retried, false if retry budget exhausted
     */
    public boolean shouldRetry(org.apache.kafka.common.header.Headers headers) {
        int retryCount = getRetryCount(headers);
        
        if (retryCount >= maxRetryAttempts) {
            logger.debug("Retry budget exhausted: {} attempts", retryCount);
            return false;
        }
        
        // Check if we should wait before retrying
        long nextRetryTime = getNextRetryTime(headers);
        long currentTime = System.currentTimeMillis();
        
        if (nextRetryTime > currentTime) {
            logger.debug("Message not yet ready for retry. Next retry at: {} (current: {})",
                nextRetryTime, currentTime);
            return false;
        }
        
        return true;
    }
    
    /**
     * Get the next retry time from message headers.
     * 
     * @param headers Kafka message headers
     * @return Next retry time in milliseconds since epoch (0 if not set)
     */
    public long getNextRetryTime(org.apache.kafka.common.header.Headers headers) {
        if (headers == null) {
            return 0;
        }
        
        Header nextRetryTimeHeader = headers.lastHeader(NEXT_RETRY_TIME_HEADER);
        if (nextRetryTimeHeader == null) {
            return 0;
        }
        
        try {
            String value = new String(nextRetryTimeHeader.value(), StandardCharsets.UTF_8);
            return Long.parseLong(value);
        } catch (Exception e) {
            logger.warn("Failed to parse next retry time header", e);
            return 0;
        }
    }
    
    /**
     * Calculate the backoff delay for the next retry attempt.
     * 
     * Uses exponential backoff: delay = initialDelay * (multiplier ^ retryCount)
     * The result is capped at maxDelay.
     * 
     * @param retryCount Current retry count (0 for first retry)
     * @return Backoff delay in milliseconds
     */
    public long calculateBackoffDelayMs(int retryCount) {
        long delay = Math.round(initialDelayMs * Math.pow(backoffMultiplier, retryCount));
        return Math.min(delay, maxDelayMs);
    }
    
    /**
     * Create a header array for a retry attempt.
     * 
     * Updates the retry count and calculates the next retry time based on exponential backoff.
     * 
     * @param currentRetryCount The current retry count (before increment)
     * @return Array of headers to add to the retry message
     */
    public Header[] createRetryHeaders(int currentRetryCount) {
        int nextRetryCount = currentRetryCount + 1;
        long backoffDelayMs = calculateBackoffDelayMs(currentRetryCount);
        long nextRetryTime = System.currentTimeMillis() + backoffDelayMs;
        
        return new Header[]{
            new RecordHeader(
                RETRY_COUNT_HEADER,
                String.valueOf(nextRetryCount).getBytes(StandardCharsets.UTF_8)
            ),
            new RecordHeader(
                NEXT_RETRY_TIME_HEADER,
                String.valueOf(nextRetryTime).getBytes(StandardCharsets.UTF_8)
            )
        };
    }
    
    /**
     * Create a failure reason message for a transient error that is being retried.
     * 
     * @param originalFailureReason The original failure reason
     * @param retryCount The current retry count (0 for first retry)
     * @return Formatted failure reason including retry information
     */
    public String formatRetryFailureReason(String originalFailureReason, int retryCount) {
        long backoffDelayMs = calculateBackoffDelayMs(retryCount);
        return String.format(
            "Transient failure (attempt %d/%d): %s. Will retry in %d ms.",
            retryCount + 1, maxRetryAttempts, originalFailureReason, backoffDelayMs
        );
    }
    
    /**
     * Create a failure reason message for a transient error that has exhausted the retry budget.
     * 
     * @param originalFailureReason The original failure reason
     * @return Formatted failure reason including exhaustion information
     */
    public String formatRetryExhaustedFailureReason(String originalFailureReason) {
        return String.format(
            "Transient failure persisted after %d attempts: %s. Retry budget exhausted.",
            maxRetryAttempts, originalFailureReason
        );
    }
    
    /**
     * Get the maximum number of retry attempts.
     */
    public int getMaxRetryAttempts() {
        return maxRetryAttempts;
    }
}
