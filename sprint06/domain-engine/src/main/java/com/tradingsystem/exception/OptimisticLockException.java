package com.tradingsystem.exception;

public class OptimisticLockException extends DomainException {

    private final Long accountId;

    public OptimisticLockException(Long accountId) {
        super("ORD-409", "Concurrent update detected");
        this.accountId = accountId;
    }

    public Long getAccountId() {
        return accountId;
    }
}
