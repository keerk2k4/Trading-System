
package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.exception.InsufficientFundsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class AccountTest {
    Account account;

    @BeforeEach
    public void createAccount() {
        account =  new Account(
                1001L,
                "ACC-001",
                "John",
                new BigDecimal("1000.00"),
                TradingStatus.ACTIVE,
                5L
        );
    }

    @Test
    void shouldStoreAccountId() {
        assertEquals(1001L, account.getAccountId());
    }

    @Test
    void shouldStoreAccountReference() {
        assertEquals("ACC-001", account.getAccountReference());
    }

    @Test
    void accountIdAndAccountReferenceShouldBeDifferentIdentifiers() {
        assertNotEquals(
                String.valueOf(account.getAccountId()),
                account.getAccountReference()
        );
    }

    @Test
    void shouldStoreHolder() {

        assertEquals("John", account.getHolder());
    }

    @Test
    void shouldStoreCashBalance() {

        assertEquals(
                new BigDecimal("1000.00"),
                account.getCashBalance()
        );
    }

    @Test
    void cashBalanceShouldUseBigDecimal() {

        assertInstanceOf(
                BigDecimal.class,
                account.getCashBalance()
        );
    }

    @Test
    void shouldStoreTradingStatus() {

        assertEquals(
                TradingStatus.ACTIVE,
                account.getTradingStatus()
        );
    }

    @Test
    void shouldReportLoadedVersion() {

        assertEquals(5L, account.getLoadedVersion());
    }

    @Test
    void creditShouldIncreaseCashBalance() {

        account.credit(new BigDecimal("250.00"));

        assertEquals(
                new BigDecimal("1250.00"),
                account.getCashBalance()
        );
    }

    @Test
    void debitShouldDecreaseCashBalance() {

        account.debit(new BigDecimal("250.00"));

        assertEquals(
                new BigDecimal("750.00"),
                account.getCashBalance()
        );
    }

    @Test
    void debitShouldBeRejectedWhenItWouldMakeBalanceNegative() {

        assertThrows(
                IllegalArgumentException.class,
                () -> account.debit(new BigDecimal("1000.01"))
        );
    }

    @Test
    void rejectedDebitShouldLeaveBalanceUnchanged() {

        assertThrows(
                InsufficientFundsException.class,
                () -> account.debit(new BigDecimal("1000.01"))
        );

        assertEquals(
                new BigDecimal("1000.00"),
                account.getCashBalance()
        );
    }

    @Test
    void canAffordShouldReturnTrueWhenBalanceIsSufficient() {
        assertTrue(account.canAfford(new BigDecimal("500.00")));
        assertTrue(account.canAfford(new BigDecimal("1000.00")));
    }

    @Test
    void canAffordShouldReturnFalseWhenBalanceIsInsufficient() {

        assertFalse(account.canAfford(new BigDecimal("1000.01")));
    }

    @Test
    void creditShouldRejectNegativeAmount() {
        assertThrows(
                IllegalArgumentException.class,
                () -> account.credit(new BigDecimal("-10.00"))
        );
    }

    @Test
    void debitShouldRejectNegativeAmount() {
        assertThrows(
                InsufficientFundsException.class,
                () -> account.debit(new BigDecimal("-10.00"))
        );
    }
}

