package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.ProductType;

import java.math.BigDecimal;
import java.math.RoundingMode;

public class Position {

    private final Account account;
    private final Instrument instrument;
    private final ProductType productType;

    private int quantity;
    private BigDecimal averagePrice;


    public Position(
            Account account,
            Instrument instrument,
            ProductType productType,
            int quantity,
            BigDecimal averagePrice
    ) {

        if (quantity < 0) {
            throw new IllegalArgumentException(
                    "Quantity cannot be negative"
            );
        }

        if (averagePrice == null ||
                averagePrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(
                    "Average price must be positive"
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
            throw new IllegalArgumentException(
                    "Cannot sell more than owned quantity"
            );
        }


        quantity -= soldQuantity;
    }



    private void validateQuantity(int quantity) {

        if (quantity <= 0) {
            throw new IllegalArgumentException(
                    "Quantity must be positive"
            );
        }
    }


    private void validatePrice(BigDecimal price) {

        if (price == null ||
                price.compareTo(BigDecimal.ZERO) <= 0) {

            throw new IllegalArgumentException(
                    "Price must be positive"
            );
        }
    }
}
