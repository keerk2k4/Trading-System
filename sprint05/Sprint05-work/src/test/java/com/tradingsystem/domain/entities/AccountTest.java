package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InvalidAmountException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class AccountTest {

    private Account account;
    private User user;

    @BeforeEach
    void createAccount() {

        user = new User(
                1L,
                "John",
                "Doe",
                "john@example.com",
                "9876543210",
                "hashed-password",
                UserStatus.ACTIVE
        );

        account = new Account(
                1001L,
                "ACC-001",
                user,
                new BigDecimal("1000.00"),
                TradingStatus.ACTIVE,
                5L
        );
    }

    @Test
    void shouldStoreAccountId() {
        assertEquals(
                1001L,
                account.getAccountId()
        );
    }

    @Test
    void shouldStoreAccountReference() {
        assertEquals(
                "ACC-001",
                account.getAccountReference()
        );
    }

    @Test
    void shouldStoreHolder() {
        assertSame(
                user,
                account.getHolder()
        );
    }

    @Test
    void holderShouldBeUser() {
        assertInstanceOf(
                User.class,
                account.getHolder()
        );
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
        assertEquals(
                5L,
                account.getLoadedVersion()
        );
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
                InsufficientFundsException.class,
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

        assertTrue(
                account.canAfford(new BigDecimal("500.00"))
        );

        assertTrue(
                account.canAfford(new BigDecimal("1000.00"))
        );
    }

    @Test
    void canAffordShouldReturnFalseWhenBalanceIsInsufficient() {

        assertFalse(
                account.canAfford(new BigDecimal("1000.01"))
        );
    }

    @Test
    void creditShouldRejectNegativeAmount() {

        assertThrows(
                InvalidAmountException.class,
                () -> account.credit(new BigDecimal("-10.00"))
        );
    }

    @Test
    void debitShouldRejectNegativeAmount() {

        assertThrows(
                InvalidAmountException.class,
                () -> account.debit(new BigDecimal("-10.00"))
        );
    }
}