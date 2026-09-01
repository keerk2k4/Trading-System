package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.TradingStatus;

import java.math.BigDecimal;

public class Account {

    private final Long accountId;
    private final String accountReference;
    private final String holder;

    private BigDecimal cashBalance;

    private final TradingStatus tradingStatus;

    private final Long loadedVersion;


    public Account(
            Long accountId,
            String accountReference,
            String holder,
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


    public String getHolder() {
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
            throw new IllegalArgumentException(
                    "Insufficient balance"
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
            throw new IllegalArgumentException(
                    "Amount cannot be null"
            );
        }

        if (amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException(
                    "Amount cannot be negative"
            );
        }
    }
}
