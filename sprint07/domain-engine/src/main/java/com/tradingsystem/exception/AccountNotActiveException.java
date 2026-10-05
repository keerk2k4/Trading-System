package com.tradingsystem.exception;

public class AccountNotActiveException extends DomainException {

    private final long accountId;

    public AccountNotActiveException(long accountId) {
        super("ACC-403", "Account not active");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
