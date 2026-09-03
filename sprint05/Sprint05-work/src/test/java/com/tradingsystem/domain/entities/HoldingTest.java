package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InvalidHoldingArgumentException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class HoldingTest {

    private Account createAccount() {

        User user = new User(
                1L,
                "John",
                "Doe",
                "john@example.com",
                "9876543210",
                "hashed-password",
                UserStatus.ACTIVE
        );

        return new Account(
                1001L,
                "ACC-1001",
                user,
                new BigDecimal("10000.00"),
                TradingStatus.ACTIVE,
                1L
        );
    }

    private Instrument createInstrument() {
        return new Instrument(
                "TCS",
                "Tata Consultancy Services",
                AssetClass.EQUITY,
                "INR"
        );
    }

    @Test
    void shouldCreateHoldingWithInitialValues() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("3500.00")
        );

        assertEquals(
                7001L,
                holding.getHoldingId()
        );

        assertEquals(
                1001L,
                holding.getAccount().getAccountId()
        );

        assertEquals(
                "TCS",
                holding.getInstrument().getSymbol()
        );

        assertEquals(
                10,
                holding.getQuantity()
        );

        assertEquals(
                new BigDecimal("3500.00"),
                holding.getAveragePrice()
        );
    }

    @Test
    void shouldIncreaseQuantityWhenBuying() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        holding.buy(5, new BigDecimal("120.00"));

        assertEquals(
                15,
                holding.getQuantity()
        );
    }

    @Test
    void shouldRecalculateWeightedAveragePriceWhenBuying() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        holding.buy(5, new BigDecimal("120.00"));

        assertEquals(
                new BigDecimal("106.67"),
                holding.getAveragePrice()
        );
    }

    @Test
    void shouldDecreaseQuantityWhenSelling() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        holding.sell(4);

        assertEquals(
                6,
                holding.getQuantity()
        );
    }

    @Test
    void shouldKeepAveragePriceWhenSelling() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        holding.sell(4);

        assertEquals(
                new BigDecimal("100.00"),
                holding.getAveragePrice()
        );
    }

    @Test
    void shouldRejectSellingMoreThanHolding() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        assertThrows(
                InsufficientHoldingsException.class,
                () -> holding.sell(11)
        );
    }

    @Test
    void failedSellShouldNotChangeQuantity() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        assertThrows(
                InsufficientHoldingsException.class,
                () -> holding.sell(11)
        );

        assertEquals(
                10,
                holding.getQuantity()
        );
    }

    @Test
    void shouldRejectZeroBuyQuantity() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        assertThrows(
                InvalidHoldingArgumentException.class,
                () -> holding.buy(
                        0,
                        new BigDecimal("120.00")
                )
        );
    }

    @Test
    void shouldRejectNegativeBuyQuantity() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        assertThrows(
                InvalidHoldingArgumentException.class,
                () -> holding.buy(
                        -5,
                        new BigDecimal("120.00")
                )
        );
    }

    @Test
    void shouldRejectZeroSellQuantity() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                10,
                new BigDecimal("100.00")
        );

        assertThrows(
                InvalidHoldingArgumentException.class,
                () -> holding.sell(0)
        );
    }

    @Test
    void shouldNeverAllowHoldingToBecomeNegative() {

        Holding holding = new Holding(
                7001L,
                createAccount(),
                createInstrument(),
                5,
                new BigDecimal("100.00")
        );

        assertThrows(
                InsufficientHoldingsException.class,
                () -> holding.sell(6)
        );

        assertTrue(
                holding.getQuantity() >= 0
        );
    }
}