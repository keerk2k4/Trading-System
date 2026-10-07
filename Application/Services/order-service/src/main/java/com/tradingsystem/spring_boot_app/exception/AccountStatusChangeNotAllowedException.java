package com.tradingsystem.spring_boot_app.exception;

/**
 * An admin asked for a status change the rules do not allow (for example out
 * of CLOSED, or PENDING to ACTIVE, which only KYC approval may do), or the
 * account's status changed between reading it and updating it. ACC-409.
 */
public class AccountStatusChangeNotAllowedException extends RuntimeException {
    public AccountStatusChangeNotAllowedException(String from, String to) {
        super("Account status cannot change from " + from + " to " + to);
    }
}
