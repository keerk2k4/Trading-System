package com.tradingsystem.exception;

public class DuplicateIdempotencyKeyException extends RuntimeException {
    public DuplicateIdempotencyKeyException(String idempotencykey) {
        super("Duplicate Idempotency Key: " + idempotencykey);
    }
}
