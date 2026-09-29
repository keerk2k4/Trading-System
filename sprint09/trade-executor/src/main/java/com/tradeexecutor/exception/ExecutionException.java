package com.tradeexecutor.exception;

/**
 * Base exception for all trade execution failures.
 * Subclasses distinguish between permanent and transient failures.
 */
public abstract class ExecutionException extends RuntimeException {
    
    public ExecutionException(String message) {
        super(message);
    }
    
    public ExecutionException(String message, Throwable cause) {
        super(message, cause);
    }
    
    /**
     * Return true if this exception should be retried.
     * Transient failures return true; permanent failures return false.
     */
    public abstract boolean isRetryable();
    
    /**
     * Return a human-readable failure reason for the dead-letter queue header.
     */
    public abstract String getFailureReason();
}
