package com.tradingsystem.exception;

import java.math.BigDecimal;

public class InsufficientFundsException extends DomainException {

    private final BigDecimal requiredAmount;
    private final BigDecimal availableAmount;

    public InsufficientFundsException(BigDecimal requiredAmount, BigDecimal availableAmount) {
        super("ORD-400", "Insufficient funds");
        this.requiredAmount = requiredAmount;
        this.availableAmount = availableAmount;
    }

    public BigDecimal getRequiredAmount() {
        return requiredAmount;
    }

    public BigDecimal getAvailableAmount() {
        return availableAmount;
    }
}
