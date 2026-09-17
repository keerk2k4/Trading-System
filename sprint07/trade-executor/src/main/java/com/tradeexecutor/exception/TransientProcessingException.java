package com.tradeexecutor.exception;

/**
 * Exception for transient processing failures that may succeed later.
 * 
 * A message that fails with a transient error may succeed if retried, so it should
 * be retried with exponential backoff up to a bounded maximum number of attempts.
 * If the retry budget is exhausted, the message should be dead-lettered.
 * 
 * Examples:
 * - Briefly unreachable Kafka broker
 * - Lost database connection
 * - Exhausted optimistic-lock retry budget
 * - Temporary network timeout
 */
public class TransientProcessingException extends RuntimeException {
    
    private final String failureReason;
    
    public TransientProcessingException(String failureReason) {
        super(failureReason);
        this.failureReason = failureReason;
    }
    
    public TransientProcessingException(String failureReason, Throwable cause) {
        super(failureReason, cause);
        this.failureReason = failureReason;
    }
    
    public String getFailureReason() {
        return failureReason;
    }
}
