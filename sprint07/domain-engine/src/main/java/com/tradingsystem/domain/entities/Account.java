
        package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InvalidAmountException;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public class Account {

    @NotNull
    private final Long accountId;

    @NotNull
    @Size(min = 1, max = 30)
    private final String accountReference;

    @NotNull
    private final User holder;

    @NotNull
    @PositiveOrZero
    @DecimalMin(value = "0.00")
    @Digits(integer = 17, fraction = 2)
    private BigDecimal cashBalance;

    @NotNull
    private final TradingStatus tradingStatus;

    @NotNull
    private final Long loadedVersion;

    public Account(
            Long accountId,
            String accountReference,
            User holder,
            BigDecimal cashBalance,
            TradingStatus tradingStatus,
            Long loadedVersion
    ) {
        validateAmount(cashBalance);
        this.accountId = accountId;
        this.accountReference = accountReference;
        this.holder = holder;
        this.cashBalance = cashBalance;
        this.tradingStatus = tradingStatus;
        this.loadedVersion = loadedVersion;
    }

    public Long getAccountId() {
        return accountId;
    }

    public String getAccountReference() {
        return accountReference;
    }

    public User getHolder() {
        return holder;
    }

    public BigDecimal getCashBalance() {
        return cashBalance;
    }

    public TradingStatus getTradingStatus() {
        return tradingStatus;
    }

    public Long getLoadedVersion() {
        return loadedVersion;
    }

    public void credit(BigDecimal amount) {
        validateAmount(amount);
        cashBalance = cashBalance.add(amount);
    }

    public void debit(BigDecimal amount) {
        validateAmount(amount);

        if (!canAfford(amount)) {
            throw new InsufficientFundsException(
                    amount,
                    cashBalance
            );
        }

        cashBalance = cashBalance.subtract(amount);
    }

    public boolean canAfford(BigDecimal amount) {
        validateAmount(amount);
        return cashBalance.compareTo(amount) >= 0;
    }

    private void validateAmount(BigDecimal amount) {
        if (amount == null) {
            throw new InvalidAmountException(
                    "Amount cannot be null"
            );
        }

        if (amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new InvalidAmountException(
                    "Amount cannot be negative"
            );
        }

        if (amount.scale() > 2) {
            throw new InvalidAmountException(
                    "Amount cannot have more than 2 decimal places"
            );
        }
    }
}

