package com.tradingsystem.exception;

public class UserNotActiveException extends DomainException {

    private final String userId;

    public UserNotActiveException(String userId) {
        super("USR-403", "User not active");
        this.userId = userId;
    }

    public String getUserId() {
        return userId;
    }
}