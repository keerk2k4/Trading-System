package com.tradeexecutor.kafka;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Manages retry logic for transient failures.
 * 
 * Implements exponential backoff with a configurable maximum number of retries.
 * 
 * Configuration:
 * - app.dlt.max-retries: Maximum number of retry attempts (default: 3)
 * - app.dlt.initial-backoff-ms: Initial backoff delay in milliseconds (default: 100)
 * - app.dlt.backoff-multiplier: Exponential backoff multiplier (default: 2.0)
 * - app.dlt.max-backoff-ms: Maximum backoff delay in milliseconds (default: 30000)
 * 
 * Backoff calculation:
 * - Attempt 1: initial-backoff-ms (100 ms)
 * - Attempt 2: 100 * 2 = 200 ms
 * - Attempt 3: 200 * 2 = 400 ms
 * - Capped at max-backoff-ms (30000 ms = 30 seconds)
 * 
 * After max-retries attempts, the message is considered permanently failed
 * and should be sent to the DLT.
 */
@Component
public class RetryHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(RetryHandler.class);
    
    @Value("${app.dlt.max-retries:3}")
    private int maxRetries;
    
    @Value("${app.dlt.initial-backoff-ms:100}")
    private long initialBackoffMs;
    
    @Value("${app.dlt.backoff-multiplier:2.0}")
    private double backoffMultiplier;
    
    @Value("${app.dlt.max-backoff-ms:30000}")
    private long maxBackoffMs;
    
    /**
     * Check if a retry attempt should be made.
     * 
     * @param attemptNumber the attempt number (1-based)
     * @return true if we should retry; false if max retries exceeded
     */
    public boolean shouldRetry(int attemptNumber) {
        boolean should = attemptNumber < maxRetries;
        logger.debug("Retry check: attempt={}, maxRetries={}, should={}", attemptNumber, maxRetries, should);
        return should;
    }
    
    /**
     * Calculate the backoff delay for the next retry attempt.
     * 
     * Uses exponential backoff:
     * delay = min(initial * (multiplier ^ (attempt - 1)), maxBackoff)
     * 
     * @param attemptNumber the attempt number (1-based)
     * @return backoff delay in milliseconds
     */
    public long calculateBackoffMs(int attemptNumber) {
        // Exponential backoff: initial * (multiplier ^ (attempt-1))
        long backoff = (long) (initialBackoffMs * Math.pow(backoffMultiplier, attemptNumber - 1));
        
        // Cap at maximum
        backoff = Math.min(backoff, maxBackoffMs);
        
        logger.debug("Calculated backoff: attempt={}, backoff={}ms", attemptNumber, backoff);
        return backoff;
    }
    
    /**
     * Wait for the calculated backoff period.
     * 
     * @param attemptNumber the attempt number (1-based)
     */
    public void waitForBackoff(int attemptNumber) {
        long backoffMs = calculateBackoffMs(attemptNumber);
        logger.info("Waiting {}ms before retry (attempt {})", backoffMs, attemptNumber + 1);
        
        try {
            Thread.sleep(backoffMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warn("Backoff interrupted");
        }
    }
    
    /**
     * Get the maximum retry count.
     */
    public int getMaxRetries() {
        return maxRetries;
    }
}
