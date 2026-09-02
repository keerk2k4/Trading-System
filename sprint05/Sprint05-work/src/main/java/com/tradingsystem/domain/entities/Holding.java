package com.tradingsystem.domain.entities;

import com.tradingsystem.exception.InvalidHoldingArgumentException;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InvalidOrderArgumentException;

import java.math.BigDecimal;
import java.math.RoundingMode;

public class Holding {

    private final Long holdingId;
    private final Account account;
    private final Instrument instrument;

    private int quantity;
    private BigDecimal averagePrice;

    public Holding(
            Long holdingId,
            Account account,
            Instrument instrument,
            int quantity,
            BigDecimal averagePrice
    ) {
        if (holdingId == null) {
            throw new InvalidHoldingArgumentException("Holding ID");
        }

        if (account == null) {
            throw new InvalidHoldingArgumentException("Account");
        }

        if (instrument == null) {
            throw new InvalidHoldingArgumentException("Instrument");
        }

        if (quantity < 0) {
            throw new InvalidHoldingArgumentException("Quantity", String.valueOf(quantity));
        }

        if (averagePrice == null || averagePrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidHoldingArgumentException(
                    "Average price must be positive"
            );
        }

        this.holdingId = holdingId;
        this.account = account;
        this.instrument = instrument;
        this.quantity = quantity;
        this.averagePrice = averagePrice.setScale(2, RoundingMode.HALF_UP);
    }

    //getters
    public Long getHoldingId() {
        return holdingId;
    }
    public Account getAccount() {
        return account;
    }
    public Instrument getInstrument() {
        return instrument;
    }
    public int getQuantity() {
        return quantity;
    }
    public BigDecimal getAveragePrice() {
        return averagePrice;
    }

    public void buy(int boughtQuantity, BigDecimal buyPrice) {
        validateQuantity(boughtQuantity);
        validatePrice(buyPrice);

        BigDecimal existingValue =
                averagePrice.multiply(BigDecimal.valueOf(quantity));

        BigDecimal newValue =
                buyPrice.multiply(BigDecimal.valueOf(boughtQuantity));

        int newQuantity = quantity + boughtQuantity;

        BigDecimal newAverage =
                existingValue
                        .add(newValue)
                        .divide(
                                BigDecimal.valueOf(newQuantity),
                                2,
                                RoundingMode.HALF_UP
                        );

        quantity = newQuantity;
        averagePrice = newAverage;
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
