package com.tradeexecutor.exception;

/**
 * Transient execution failure that may succeed on retry.
 * 
 * Examples:
 * - Database connection temporarily lost
 * - Kafka broker temporarily unreachable
 * - Optimistic lock retry budget exhausted (message should be retried by external mechanism)
 * - Temporary network timeout
 * - Database deadlock
 * 
 * These failures indicate a temporary problem that may resolve
 * with another attempt. The message should be retried with
 * exponential backoff up to a bounded maximum number of attempts.
 * 
 * After the retry budget is exhausted, the message is dead-lettered.
 */
public class TransientProcessingException extends ExecutionException {
    
    public TransientProcessingException(String message) {
        super(message);
    }
    
    public TransientProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
    
    @Override
    public boolean isRetryable() {
        return true;
    }
    
    @Override
    public String getFailureReason() {
        return "TRANSIENT: " + getMessage();
    }
}
