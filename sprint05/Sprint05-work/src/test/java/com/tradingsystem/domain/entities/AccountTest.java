
package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.TradingStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class AccountTest {

    @Test
    void shouldStoreAccountId() {
        Account account = createAccount();
        assertEquals(1001L, account.getAccountId());
    }

    @Test
    void shouldStoreAccountReference() {
        Account account = createAccount();
        assertEquals("ACC-001", account.getAccountReference());
    }

    @Test
    void accountIdAndAccountReferenceShouldBeDifferentIdentifiers() {
        Account account = createAccount();
        assertNotEquals(
                String.valueOf(account.getAccountId()),
                account.getAccountReference()
        );
    }

    @Test
    void shouldStoreHolder() {
        Account account = createAccount();

        assertEquals("John", account.getHolder());
    }

    @Test
    void shouldStoreCashBalance() {
        Account account = createAccount();

        assertEquals(
                new BigDecimal("1000.00"),
                account.getCashBalance()
        );
    }

    @Test
    void cashBalanceShouldUseBigDecimal() {
        Account account = createAccount();

        assertInstanceOf(
                BigDecimal.class,
                account.getCashBalance()
        );
    }

    @Test
    void shouldStoreTradingStatus() {
        Account account = createAccount();

        assertEquals(
                TradingStatus.ACTIVE,
                account.getTradingStatus()
        );
    }

    @Test
    void shouldReportLoadedVersion() {
        Account account = createAccount();

        assertEquals(5L, account.getLoadedVersion());
    }

    @Test
    void creditShouldIncreaseCashBalance() {
        Account account = createAccount();

        account.credit(new BigDecimal("250.00"));

        assertEquals(
                new BigDecimal("1250.00"),
                account.getCashBalance()
        );
    }

    @Test
    void debitShouldDecreaseCashBalance() {
        Account account = createAccount();

        account.debit(new BigDecimal("250.00"));

        assertEquals(
                new BigDecimal("750.00"),
                account.getCashBalance()
        );
    }

    @Test
    void debitShouldBeRejectedWhenItWouldMakeBalanceNegative() {
        Account account = createAccount();

        assertThrows(
                IllegalArgumentException.class,
                () -> account.debit(new BigDecimal("1000.01"))
        );
    }

    @Test
    void rejectedDebitShouldLeaveBalanceUnchanged() {
        Account account = createAccount();

        assertThrows(
                IllegalArgumentException.class,
                () -> account.debit(new BigDecimal("1000.01"))
        );

        assertEquals(
                new BigDecimal("1000.00"),
                account.getCashBalance()
        );
    }

    @Test
    void canAffordShouldReturnTrueWhenBalanceIsSufficient() {
        Account account = createAccount();

        assertTrue(account.canAfford(new BigDecimal("500.00")));
        assertTrue(account.canAfford(new BigDecimal("1000.00")));
    }

    @Test
    void canAffordShouldReturnFalseWhenBalanceIsInsufficient() {
        Account account = createAccount();

        assertFalse(account.canAfford(new BigDecimal("1000.01")));
    }

    @Test
    void creditShouldRejectNegativeAmount() {
        Account account = createAccount();

        assertThrows(
                IllegalArgumentException.class,
                () -> account.credit(new BigDecimal("-10.00"))
        );
    }

    @Test
    void debitShouldRejectNegativeAmount() {
        Account account = createAccount();

        assertThrows(
                IllegalArgumentException.class,
                () -> account.debit(new BigDecimal("-10.00"))
        );
    }

    private Account createAccount() {
        return new Account(
                1001L,
                "ACC-001",
                "John",
                new BigDecimal("1000.00"),
                TradingStatus.ACTIVE,
                5L
        );
    }
}

