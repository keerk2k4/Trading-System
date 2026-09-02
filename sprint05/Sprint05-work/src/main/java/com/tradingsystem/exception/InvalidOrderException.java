package com.tradingsystem.exception;

public class InvalidOrderException extends DomainException {

    private final String propertyName;
    private final String invalidValue;

    public InvalidOrderException(String propertyName) {
        super("VAL-422", "Invalid order parameter");
        this.propertyName = propertyName;
        this.invalidValue = "Null";
    }

    public InvalidOrderException(String propertyName, String invalidValue) {
        super("VAL-422", "Invalid order parameter");
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
