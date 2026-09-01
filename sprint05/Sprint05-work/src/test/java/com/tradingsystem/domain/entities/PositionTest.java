package com.tradingsystem.domain.entities;


import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.ProductType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class PositionTest {


    @Test
    void shouldCreatePositionWithInitialValues() {

        Position position = createPosition();

        assertEquals(10, position.getQuantity());

        assertEquals(
                new BigDecimal("100.00"),
                position.getAveragePrice()
        );
    }


    @Test
    void buyShouldIncreaseQuantity() {

        Position position = createPosition();

        position.buy(
                5,
                new BigDecimal("120.00")
        );

        assertEquals(
                15,
                position.getQuantity()
        );
    }


    @Test
    void buyShouldRecalculateAveragePrice() {

        Position position = createPosition();

        /*
            Existing:
            10 shares @ 100

            Buy:
            5 shares @ 120

            New average:
            (10*100 + 5*120) / 15

            = 106.67
         */

        position.buy(
                5,
                new BigDecimal("120.00")
        );


        assertEquals(
                new BigDecimal("106.67"),
                position.getAveragePrice()
        );
    }


    @Test
    void sellShouldReduceQuantity() {

        Position position = createPosition();

        position.sell(5);

        assertEquals(
                5,
                position.getQuantity()
        );
    }


    @Test
    void sellShouldKeepAveragePriceUnchanged() {

        Position position = createPosition();

        position.sell(5);

        assertEquals(
                new BigDecimal("100.00"),
                position.getAveragePrice()
        );
    }


    @Test
    void sellingMoreThanAvailableShouldFail() {

        Position position = createPosition();


        assertThrows(
                IllegalArgumentException.class,
                () -> position.sell(11)
        );
    }


    @Test
    void failedSellShouldNotChangeQuantity() {

        Position position = createPosition();

        assertThrows(
                IllegalArgumentException.class,
                () -> position.sell(11)
        );


        assertEquals(
                10,
                position.getQuantity()
        );
    }


    @Test
    void buyingNegativeQuantityShouldFail() {

        Position position = createPosition();


        assertThrows(
                IllegalArgumentException.class,
                () -> position.buy(
                        -5,
                        new BigDecimal("100.00")
                )
        );
    }


    @Test
    void sellingNegativeQuantityShouldFail() {

        Position position = createPosition();


        assertThrows(
                IllegalArgumentException.class,
                () -> position.sell(-5)
        );
    }


    private Position createPosition() {

        Account account =
                new Account(
                        1L,
                        "ACC-001",
                        "John",
                        new BigDecimal("1000.00"),
                        com.tradingsystem.domain.enums.TradingStatus.ACTIVE,
                        1L
                );


        Instrument instrument =
                new Instrument(
                        "FAUX:TCS",
                        "Tata Consultancy Services",
                        AssetClass.EQUITY,
                        "INR"
                );


        return new Position(
                account,
                instrument,
                ProductType.DELIVERY,
                10,
                new BigDecimal("100.00")
        );
    }
}