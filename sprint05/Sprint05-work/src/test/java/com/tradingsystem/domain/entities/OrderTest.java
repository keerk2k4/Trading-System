package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.*;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class OrderTest {


    @Test
    void shouldCreateOrderWithRequiredDetails() {

        Order order = createOrder();

        assertEquals(1L, order.getOrderId());
        assertEquals(OrderSide.BUY, order.getSide());
        assertEquals(OrderType.LIMIT, order.getOrderType());
        assertEquals(ProductType.DELIVERY, order.getProductType());
        assertEquals(10, order.getQuantity());

        assertEquals(
                new BigDecimal("100.00"),
                order.getLimitPrice()
        );
    }


    @Test
    void newOrderShouldHaveNewStatus() {

        Order order = createOrder();

        assertEquals(
                OrderStatus.NEW,
                order.getStatus()
        );
    }


    @Test
    void shouldMoveFromNewToOpen() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);

        assertEquals(
                OrderStatus.OPEN,
                order.getStatus()
        );
    }


    @Test
    void shouldMoveFromOpenToPartiallyFilled() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.PARTIALLY_FILLED);

        assertEquals(
                OrderStatus.PARTIALLY_FILLED,
                order.getStatus()
        );
    }


    @Test
    void shouldMoveFromPartiallyFilledToFilled() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.PARTIALLY_FILLED);
        order.transitionTo(OrderStatus.FILLED);

        assertEquals(
                OrderStatus.FILLED,
                order.getStatus()
        );
    }


    @Test
    void shouldAllowCancellationFromNew() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.CANCELLED);

        assertEquals(
                OrderStatus.CANCELLED,
                order.getStatus()
        );
    }


    @Test
    void shouldRejectInvalidTransitionAfterTerminalState() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.FILLED);

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(OrderStatus.OPEN)
        );
    }


    @Test
    void shouldRejectSecondTerminalState() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.CANCELLED);

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(OrderStatus.FILLED)
        );
    }


    @Test
    void limitPriceShouldRepresentCustomerSubmittedPrice() {

        Order order = createOrder();

        assertEquals(
                new BigDecimal("100.00"),
                order.getLimitPrice()
        );

    }


    private Order createOrder() {

        Account account =
                new Account(
                        1L,
                        "ACC-001",
                        "John",
                        new BigDecimal("1000.00"),
                        TradingStatus.ACTIVE,
                        1L
                );


        Instrument instrument =
                new Instrument(
                        "FAUX:TCS",
                        "Tata Consultancy Services",
                        AssetClass.EQUITY,
                        "INR"
                );


        return new Order(
                1L,
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.DELIVERY,
                10,
                new BigDecimal("100.00")
        );
    }
}
