
package com.tradingsystem.exception;

public class UserNotActiveException extends DomainException {

    private final long userId;

    public UserNotActiveException(long userId) {
        super("USR-403", "User not active");
        this.userId = userId;
    }

    public long getUserId() {
        return userId;
    }
}

