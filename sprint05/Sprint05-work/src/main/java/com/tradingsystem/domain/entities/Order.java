package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.*;

import java.math.BigDecimal;

public class Order {

    private final Long orderId;

    private final Account account;
    private final Instrument instrument;

    private final OrderType orderType;
    private final OrderSide side;
    private final ProductType productType;

    private final int quantity;

    private final BigDecimal limitPrice;

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
                            || next == OrderStatus.CANCELLED;

            case PARTIALLY_FILLED ->
                    next == OrderStatus.FILLED
                            || next == OrderStatus.CANCELLED;

            default -> false;
        };
    }
}
