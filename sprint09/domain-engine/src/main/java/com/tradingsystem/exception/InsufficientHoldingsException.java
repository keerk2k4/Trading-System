package com.tradingsystem.exception;

public class InsufficientHoldingsException extends DomainException {

    private final int requiredQuantity;
    private final int availableQuantity;

    public InsufficientHoldingsException(int requiredQuantity, int availableQuantity) {
        super("ORD-409", "Insufficient holdings");
        this.requiredQuantity = requiredQuantity;
        this.availableQuantity = availableQuantity;
    }

    public int getRequiredQuantity() {
        return requiredQuantity;
    }

    public int getAvailableQuantity() {
        return availableQuantity;
    }
}
