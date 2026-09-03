package com.tradingsystem.exception;

public class DuplicateOrderException extends DomainException {

    private final String idempotencyKey;

    public DuplicateOrderException(String idempotencyKey) {
        super("ORD-409", "Duplicate Idempotency Key");
        this.idempotencyKey = idempotencyKey;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }
}
