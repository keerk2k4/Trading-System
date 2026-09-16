package com.tradingsystem.spring_boot_app.exception;

public class UnauthorisedException extends RuntimeException {
    public UnauthorisedException() {
        super("Unauthorised");
    }
}
