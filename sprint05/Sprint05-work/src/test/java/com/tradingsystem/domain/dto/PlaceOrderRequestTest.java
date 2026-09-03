package com.tradingsystem.domain.dto;


import com.tradingsystem.domain.enums.OrderSide;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;


class PlaceOrderRequestTest {


    private Validator validator;


    @BeforeEach
    void setup() {

        ValidatorFactory factory =
                Validation.buildDefaultValidatorFactory();

        validator = factory.getValidator();
    }



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
    void validRequestShouldPassValidation() {

        PlaceOrderRequest request = validRequest();

        assertTrue(
                validator.validate(request).isEmpty()
        );
    }



    @Test
    void nullRequiredFieldShouldBeRejected() {

        PlaceOrderRequest request =
                new PlaceOrderRequest(
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                );


        assertFalse(
                validator.validate(request).isEmpty()
        );
    }



    @Test
    void zeroQuantityShouldBeRejected() {

        PlaceOrderRequest request =
                new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        0,
                        new BigDecimal("150.00"),
                        "12345678"
                );


        assertFalse(
                validator.validate(request).isEmpty()
        );
    }



    @Test
    void negativeQuantityShouldBeRejected() {

        PlaceOrderRequest request =
                new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        -1,
                        new BigDecimal("150.00"),
                        "12345678"
                );


        assertFalse(
                validator.validate(request).isEmpty()
        );
    }



    @Test
    void zeroPriceShouldBeRejected() {

        PlaceOrderRequest request =
                new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        10,
                        BigDecimal.ZERO,
                        "12345678"
                );


        assertFalse(
                validator.validate(request).isEmpty()
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


        assertTrue(
                validator.validate(request).isEmpty()
        );
    }



    @Test
    void idempotencyKeyBelowMinimumShouldFail() {

        PlaceOrderRequest request =
                new PlaceOrderRequest(
                        1L,
                        "AAPL",
                        OrderSide.BUY,
                        10,
                        new BigDecimal("150.00"),
                        "1234567"
                );


        assertFalse(
                validator.validate(request).isEmpty()
        );
    }
}