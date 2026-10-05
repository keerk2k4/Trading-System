package com.tradingsystem.domain.dto;


import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;


class PlaceOrderRequestTest {



    private PlaceOrderRequest validRequest() {

        return new PlaceOrderRequest(
                1L,
                "AAPL",
                OrderSide.BUY,
                10,
                new BigDecimal("150.00"),
                "12345678"
        );
    }



    @Test
    void validRequestShouldBeCreated() {

        PlaceOrderRequest request = validRequest();

        assertEquals(1L, request.getAccountId());
        assertEquals("AAPL", request.getSymbol());
        assertEquals(OrderSide.BUY, request.getSide());
    }



    @Test
    void nullAccountIdShouldBeRejected() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        null,
                        "AAPL",
                        OrderSide.BUY,
                        10,
                        new BigDecimal("150.00"),
                        "12345678"
                )
        );
    }



    @Test
    void nullSymbolShouldBeRejected() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        1L,
                        null,
                        OrderSide.BUY,
                        10,
                        new BigDecimal("150.00"),
                        "12345678"
                )
        );
    }



    @Test
    void nullSideShouldBeRejected() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        null,
                        10,
                        new BigDecimal("150.00"),
                        "12345678"
                )
        );
    }



    @Test
    void zeroQuantityShouldBeRejected() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        0,
                        new BigDecimal("150.00"),
                        "12345678"
                )
        );
    }



    @Test
    void negativeQuantityShouldBeRejected() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        -1,
                        new BigDecimal("150.00"),
                        "12345678"
                )
        );
    }



    @Test
    void zeroPriceShouldBeRejected() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        10,
                        BigDecimal.ZERO,
                        "12345678"
                )
        );
    }



    @Test
    void minimumBoundaryValuesShouldPass() {

        PlaceOrderRequest request =
                new PlaceOrderRequest(
                        1L,
                        "A",
                        OrderSide.BUY,
                        1,
                        new BigDecimal("0.01"),
                        "12345678"
                );

        assertEquals(1, request.getQuantity());
        assertEquals(new BigDecimal("0.01"), request.getPrice());
    }



    @Test
    void idempotencyKeyBelowMinimumShouldFail() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        10,
                        new BigDecimal("150.00"),
                        "1234567"
                )
        );
    }
}
