package com.tradingsystem.exception;

public class InsufficientFundsException extends DomainException {

    private final double requiredAmount;
    private final double availableAmount;

    public InsufficientFundsException(double requiredAmount, double availableAmount) {
        super("ORD-400", "Insufficient funds");
        this.requiredAmount = requiredAmount;
        this.availableAmount = availableAmount;
    }

    public double getRequiredAmount() {
        return requiredAmount;
    }

    public double getAvailableAmount() {
        return availableAmount;
    }
}
