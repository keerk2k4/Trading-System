package com.tradingsystem.exception;

public class InvalidHoldingArgumentException extends DomainException {

    private final String propertyName;
    private final String invalidValue;

    public InvalidHoldingArgumentException(String propertyName) {
        super("VAL-422", "Invalid holding parameter");
        this.propertyName = propertyName;
        this.invalidValue = "Null";
    }

    public InvalidHoldingArgumentException(String propertyName, String invalidValue) {
        super("VAL-422", "Invalid holding parameter");
        this.propertyName = propertyName;
        this.invalidValue = invalidValue;
    }

    public String getPropertyName() {
        return propertyName;
    }

    public String getInvalidValue() {
        return invalidValue;
    }
}
