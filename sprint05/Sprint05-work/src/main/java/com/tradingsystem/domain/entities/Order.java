package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.*;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public class Order {

    @NotNull
    private final Long orderId;

    @NotNull
    private final Account account;

    @NotNull
    private final Instrument instrument;

    @NotNull
    private final OrderType orderType;

    @NotNull
    private final OrderSide side;

    @NotNull
    private final ProductType productType;

    @Positive
    private final int quantity;

    @DecimalMin(value = "0.01")
    @Digits(integer = 17, fraction = 2)
    private final BigDecimal limitPrice;

    @NotNull
    private OrderStatus status;


    public Order(
            Long orderId,
            Account account,
            Instrument instrument,
            OrderType orderType,
            OrderSide side,
            ProductType productType,
            int quantity,
            BigDecimal limitPrice
    ) {

        if (orderId == null) {
            throw new IllegalArgumentException(
                    "Order ID cannot be null"
            );
        }

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

        if (orderType == null) {
            throw new IllegalArgumentException(
                    "Order type cannot be null"
            );
        }

        if (side == null) {
            throw new IllegalArgumentException(
                    "Order side cannot be null"
            );
        }

        if (productType == null) {
            throw new IllegalArgumentException(
                    "Product type cannot be null"
            );
        }

        if (quantity <= 0) {
            throw new IllegalArgumentException(
                    "Order quantity must be positive"
            );
        }

        if (limitPrice != null) {
            validateLimitPrice(limitPrice);
        }

        if (requiresLimitPrice(orderType) && limitPrice == null) {
            throw new IllegalArgumentException(
                    "Limit price is required for " + orderType
            );
        }

        this.orderId = orderId;
        this.account = account;
        this.instrument = instrument;
        this.orderType = orderType;
        this.side = side;
        this.productType = productType;
        this.quantity = quantity;
        this.limitPrice = limitPrice;

        this.status = OrderStatus.NEW;
    }


    public Long getOrderId() {
        return orderId;
    }


    public Account getAccount() {
        return account;
    }


    public Instrument getInstrument() {
        return instrument;
    }


    public OrderType getOrderType() {
        return orderType;
    }


    public OrderSide getSide() {
        return side;
    }


    public ProductType getProductType() {
        return productType;
    }


    public int getQuantity() {
        return quantity;
    }


    public BigDecimal getLimitPrice() {
        return limitPrice;
    }


    public OrderStatus getStatus() {
        return status;
    }


    public void transitionTo(OrderStatus newStatus) {

        if (newStatus == null) {
            throw new IllegalArgumentException(
                    "New status cannot be null"
            );
        }

        if (isTerminal(status)) {
            throw new IllegalStateException(
                    "Order already reached terminal state"
            );
        }

        if (!isValidTransition(status, newStatus)) {
            throw new IllegalStateException(
                    "Invalid order transition: "
                            + status
                            + " -> "
                            + newStatus
            );
        }

        this.status = newStatus;
    }


    public boolean isTerminal() {
        return isTerminal(status);
    }


    private boolean isTerminal(OrderStatus status) {

        return status == OrderStatus.FILLED
                || status == OrderStatus.CANCELLED
                || status == OrderStatus.REJECTED
                || status == OrderStatus.EXPIRED;
    }


    private boolean isValidTransition(
            OrderStatus current,
            OrderStatus next
    ) {

        return switch (current) {

            case NEW ->
                    next == OrderStatus.OPEN
                            || next == OrderStatus.CANCELLED
                            || next == OrderStatus.REJECTED;

            case OPEN ->
                    next == OrderStatus.PARTIALLY_FILLED
                            || next == OrderStatus.FILLED
                            || next == OrderStatus.CANCELLED
                            || next == OrderStatus.EXPIRED;

            case PARTIALLY_FILLED ->
                    next == OrderStatus.FILLED
                            || next == OrderStatus.CANCELLED;

            default -> false;
        };
    }


    private boolean requiresLimitPrice(OrderType orderType) {

        return orderType == OrderType.LIMIT
                || orderType == OrderType.STOP_LIMIT;
    }


    private void validateLimitPrice(BigDecimal price) {

        if (price.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(
                    "Limit price must be positive"
            );
        }

        if (price.scale() > 2) {
            throw new IllegalArgumentException(
                    "Limit price cannot have more than 2 decimal places"
            );
        }
    }
}