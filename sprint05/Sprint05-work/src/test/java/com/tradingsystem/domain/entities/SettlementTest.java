package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.ProductType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class SettlementTest {

    private Account createAccount() {
        return new Account(
                1001L,
                "ACC-1001",
                "John Doe",
                new BigDecimal("10000.00"),
                com.tradingsystem.domain.enums.TradingStatus.ACTIVE,
                1L
        );
    }

    private Instrument createInstrument() {
        return new Instrument(
                "TCS",
                "Tata Consultancy Services",
                com.tradingsystem.domain.enums.AssetClass.EQUITY,
                "INR"
        );
    }

    @Test
    void shouldCreateSettlementWithInitialValues() {
        Settlement settlement = new Settlement(
                5001L,
                createAccount(),
                createInstrument(),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        assertEquals(5001L, settlement.getSettlementId());
        assertEquals(createAccount().getAccountId(), settlement.getAccount().getAccountId());
        assertEquals("TCS", settlement.getInstrument().getSymbol());
        assertEquals(ProductType.DELIVERY, settlement.getProductType());
        assertEquals(10, settlement.getQuantity());
        assertEquals(new BigDecimal("3500.00"), settlement.getExecutionPrice());
        assertEquals(Settlement.SettlementStatus.PENDING, settlement.getStatus());
    }

    @Test
    void shouldMarkSettlementAsCompleted() {
        Settlement settlement = new Settlement(
                5001L,
                createAccount(),
                createInstrument(),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        settlement.complete();

        assertEquals(
                Settlement.SettlementStatus.COMPLETED,
                settlement.getStatus()
        );
    }

    @Test
    void shouldNotCompleteSettlementTwice() {
        Settlement settlement = new Settlement(
                5001L,
                createAccount(),
                createInstrument(),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        settlement.complete();

        assertThrows(
                IllegalStateException.class,
                settlement::complete
        );
    }

    @Test
    void shouldMarkSettlementAsFailed() {
        Settlement settlement = new Settlement(
                5001L,
                createAccount(),
                createInstrument(),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        settlement.fail();

        assertEquals(
                Settlement.SettlementStatus.FAILED,
                settlement.getStatus()
        );
    }

    @Test
    void shouldNotFailCompletedSettlement() {
        Settlement settlement = new Settlement(
                5001L,
                createAccount(),
                createInstrument(),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        settlement.complete();

        assertThrows(
                IllegalStateException.class,
                settlement::fail
        );
    }

    @Test
    void shouldRejectZeroQuantity() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Settlement(
                        5001L,
                        createAccount(),
                        createInstrument(),
                        ProductType.DELIVERY,
                        0,
                        new BigDecimal("3500.00")
                )
        );
    }

    @Test
    void shouldRejectNegativeQuantity() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Settlement(
                        5001L,
                        createAccount(),
                        createInstrument(),
                        ProductType.DELIVERY,
                        -5,
                        new BigDecimal("3500.00")
                )
        );
    }

    @Test
    void shouldRejectNonPositiveExecutionPrice() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Settlement(
                        5001L,
                        createAccount(),
                        createInstrument(),
                        ProductType.DELIVERY,
                        10,
                        BigDecimal.ZERO
                )
        );
    }
}
