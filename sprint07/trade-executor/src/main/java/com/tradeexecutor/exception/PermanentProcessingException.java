package com.tradeexecutor.exception;

/**
 * Exception for permanent processing failures that should not be retried.
 * 
 * A message that fails with a permanent error will never succeed, so it should
 * be dead-lettered immediately on the first attempt.
 * 
 * Examples:
 * - Malformed JSON
 * - Missing required field (e.g., orderId)
 * - Order ID does not exist in Postgres
 * - Unexpected/unknown event type
 */
public class PermanentProcessingException extends RuntimeException {
    
    private final String failureReason;
    
    public PermanentProcessingException(String failureReason) {
        super(failureReason);
        this.failureReason = failureReason;
    }
    
    public PermanentProcessingException(String failureReason, Throwable cause) {
        super(failureReason, cause);
        this.failureReason = failureReason;
    }
    
    public String getFailureReason() {
        return failureReason;
    }
}
