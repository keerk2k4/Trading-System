package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InvalidOrderException;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.math.RoundingMode;

public class Position {

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


    public Position(
            Account account,
            Instrument instrument,
            ProductType productType,
            int quantity,
            BigDecimal averagePrice
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
            throw new InvalidOrderException("quantity",String.valueOf(quantity));
                    
        }

        if (averagePrice == null ||
                averagePrice.compareTo(BigDecimal.ZERO) <= 0) {
           throw new InvalidOrderException(
                    "averagePrice",
                    averagePrice == null ? "null" : averagePrice.toString()
            );
        }

        this.account = account;
        this.instrument = instrument;
        this.productType = productType;
        this.quantity = quantity;
        this.averagePrice = averagePrice.setScale(
                2,
                RoundingMode.HALF_UP
        );
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


    public BigDecimal getAveragePrice() {
        return averagePrice;
    }


    /**
     * Buy increases quantity and recalculates average cost.
     *
     * Example:
     *
     * Existing:
     * 10 shares @ 100
     *
     * Buy:
     * 5 shares @ 120
     *
     * New:
     * 15 shares @ 106.67
     */
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


    /**
     * Sell reduces quantity.
     *
     * Average price remains unchanged.
     */
    public void sell(int soldQuantity) {

        validateQuantity(soldQuantity);


        if (soldQuantity > quantity) {
            throw new InsufficientHoldingsException(soldQuantity, quantity);
        }


        quantity -= soldQuantity;
    }


    private void validateQuantity(int quantity) {

        if (quantity <= 0) {
            throw new InvalidOrderException("quantity", String.valueOf(quantity));
        }
    }


    private void validatePrice(BigDecimal price) {

        if (price == null ||
                price.compareTo(BigDecimal.ZERO) <= 0) {

            throw new InvalidOrderException(
                    "price",
                    price == null ? "null" : price.toString()
            );
        }
    }
}