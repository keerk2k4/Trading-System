package com.tradingsystem.exception;

public abstract class DomainException extends RuntimeException {

    private final String code;

    protected DomainException(String code, String catalogueMessage) {
        super(catalogueMessage);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
