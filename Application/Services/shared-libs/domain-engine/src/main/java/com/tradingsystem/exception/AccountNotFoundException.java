package com.tradingsystem.exception;

public class AccountNotFoundException extends DomainException {

    private final long accountId;

    public AccountNotFoundException(long accountId) {
        super("ACC-404", "Account not found");
        this.accountId = accountId;
    }

    public long getAccountId() {
        return accountId;
    }
}
