package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InvalidOrderArgumentException;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

public class Position {

    private final Long positionId;

    @NotNull
    private final Account account;

    @NotNull
    private final Instrument instrument;

    @NotNull
    private final ProductType productType;

    @PositiveOrZero
    private int quantity;

    @NotNull
    @DecimalMin(value = "0.01")
    @Digits(integer = 17, fraction = 2)
    private BigDecimal averagePrice;

    @NotNull
    @DecimalMin(value = "0.00")
    @Digits(integer = 17, fraction = 2)
    private BigDecimal realizedPnl;

    @NotNull
    private String positionStatus;

    private LocalDateTime openedAt;
    private LocalDateTime closedAt;
    private LocalDateTime updatedAt;


    public Position(
            Long positionId,
            Account account,
            Instrument instrument,
            ProductType productType,
            int quantity,
            BigDecimal averagePrice,
            BigDecimal realizedPnl,
            String positionStatus,
            LocalDateTime openedAt,
            LocalDateTime closedAt,
            LocalDateTime updatedAt
    ) {

        if (account == null) {
            throw new IllegalArgumentException(
                    "Account cannot be null"
            );
        }

        if (instrument == null) {
            throw new IllegalArgumentException(
                    "Instrument cannot be null"
            );
        }

        if (productType == null) {
            throw new IllegalArgumentException(
                    "Product type cannot be null"
            );
        }

        if (quantity < 0) {
            throw new InvalidOrderArgumentException("quantity",String.valueOf(quantity));
                    
        }

        if (averagePrice == null ||
                averagePrice.compareTo(BigDecimal.ZERO) <= 0) {
           throw new InvalidOrderArgumentException(
                    "averagePrice",
                    averagePrice == null ? "null" : averagePrice.toString()
            );
        }

        this.positionId = positionId;
        this.account = account;
        this.instrument = instrument;
        this.productType = productType;
        this.quantity = quantity;
        this.averagePrice = averagePrice.setScale(
                2,
                RoundingMode.HALF_UP
        );
        this.realizedPnl = realizedPnl != null ? realizedPnl.setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        this.positionStatus = positionStatus;
        this.openedAt = openedAt;
        this.closedAt = closedAt;
        this.updatedAt = updatedAt;
    }


    public Account getAccount() {
        return account;
    }
    public Long getPositionId() {
        return positionId;
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
    public BigDecimal getAveragePrice() {
        return averagePrice;
    }
    public BigDecimal getRealizedPnl() {
        return realizedPnl;
    }
    public String getPositionStatus() {
        return positionStatus;
    }
    public LocalDateTime getOpenedAt() {
        return openedAt;
    }
    public LocalDateTime getClosedAt() {
        return closedAt;
    }
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    public void buy(
            int boughtQuantity,
            BigDecimal buyPrice
    ) {

        validateQuantity(boughtQuantity);
        validatePrice(buyPrice);

        BigDecimal existingValue =
                averagePrice.multiply(
                        BigDecimal.valueOf(quantity)
                );


        BigDecimal newValue =
                buyPrice.multiply(
                        BigDecimal.valueOf(boughtQuantity)
                );


        int newQuantity =
                quantity + boughtQuantity;


        averagePrice =
                existingValue
                        .add(newValue)
                        .divide(
                                BigDecimal.valueOf(newQuantity),
                                2,
                                RoundingMode.HALF_UP
                        );


        quantity = newQuantity;
    }

    public void sell(int soldQuantity) {

        validateQuantity(soldQuantity);


        if (soldQuantity > quantity) {
            throw new InsufficientHoldingsException(soldQuantity, quantity);
        }

        quantity -= soldQuantity;
    }

    private void validateQuantity(int quantity) {

        if (quantity <= 0) {
            throw new InvalidOrderArgumentException("quantity", String.valueOf(quantity));
        }
    }

    private void validatePrice(BigDecimal price) {

        if (price == null ||
                price.compareTo(BigDecimal.ZERO) <= 0) {

            throw new InvalidOrderArgumentException(
                    "price",
                    price == null ? "null" : price.toString()
            );
        }
    }
}