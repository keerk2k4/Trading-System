package com.tradeexecutor.exception;

/**
 * Permanent execution failure that should not be retried.
 * 
 * Examples:
 * - Malformed JSON in Kafka message
 * - Missing required fields (orderId, accountId)
 * - Order ID does not exist in database
 * - Instrument symbol not found
 * - Invalid field values
 * - Unknown event type
 * 
 * These failures indicate a problem with the message or data that
 * will not resolve with additional attempts. The message should be
 * immediately dead-lettered with no retries.
 */
public class PermanentProcessingException extends ExecutionException {
    
    public PermanentProcessingException(String message) {
        super(message);
    }
    
    public PermanentProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
    
    @Override
    public boolean isRetryable() {
        return false;
    }
    
    @Override
    public String getFailureReason() {
        return "PERMANENT: " + getMessage();
    }
}
