package com.tradingsystem.spring_boot_app.exception;

/**
 * A valid token whose roles do not allow the route, such as a customer token
 * on an admin-only route. Rendered as AUTH-403, the code the Auth service
 * already uses for the same refusal.
 */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException() {
        super("Forbidden");
    }
}
