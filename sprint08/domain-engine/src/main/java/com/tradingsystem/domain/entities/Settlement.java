package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.ProductType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

public class Settlement {

    public enum SettlementStatus {
        PENDING,
        COMPLETED,
        FAILED
    }

    private final Long settlementId;
    private final Account account;
    private final Instrument instrument;
    private final ProductType productType;
    private final int quantity;
    private final BigDecimal executionPrice;
    private final LocalDate settlementDate;

    private SettlementStatus status;

    public Settlement(
            Long settlementId,
            Account account,
            Instrument instrument,
            ProductType productType,
            int quantity,
            BigDecimal executionPrice,
            LocalDate settlementDate
    ) {
        if (settlementId == null) {
            throw new IllegalArgumentException("Settlement ID cannot be null");
        }

        if (account == null) {
            throw new IllegalArgumentException("Account cannot be null");
        }

        if (instrument == null) {
            throw new IllegalArgumentException("Instrument cannot be null");
        }

        if (productType == null) {
            throw new IllegalArgumentException("Product type cannot be null");
        }

        if (quantity <= 0) {
            throw new IllegalArgumentException("Settlement quantity must be positive");
        }

        if (executionPrice == null || executionPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Execution price must be positive");
        }

        if (settlementDate == null) {
            throw new IllegalArgumentException("Settlement date cannot be null");
        }

        this.settlementId = settlementId;
        this.account = account;
        this.instrument = instrument;
        this.productType = productType;
        this.quantity = quantity;
        this.executionPrice = executionPrice.setScale(2, java.math.RoundingMode.HALF_UP);
        this.settlementDate = settlementDate;
        this.status = SettlementStatus.PENDING;
    }

    public Long getSettlementId() {
        return settlementId;
    }
    public Account getAccount() {
        return account;
    }
    public Instrument getInstrument() {
        return instrument;
    }
    public ProductType getProductType() {
        return productType;
    }
    public int getQuantity() {
        return quantity;
    }
    public BigDecimal getExecutionPrice() {
        return executionPrice;
    }
    public LocalDate getSettlementDate() {
        return settlementDate;
    }
    public SettlementStatus getStatus() {
        return status;
    }

}