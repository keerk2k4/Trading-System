package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class InMemoryHoldingRepositoryTest {

    @Test
    void shouldSaveAndFindHoldingByAccountId() {
        InMemoryHoldingRepository repository = new InMemoryHoldingRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Holding holding = new Holding(
                1L,
                account,
                instrument,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", holding);

        List<Holding> result = repository.findByAccountId("1");

        assertEquals(1, result.size());
        assertSame(holding, result.get(0));
    }

    @Test
    void shouldStoreMultipleHoldingsForSameAccount() {
        InMemoryHoldingRepository repository = new InMemoryHoldingRepository();

        Account account = createAccount(1L);

        Holding holding1 = new Holding(
                1L,
                account,
                createInstrument("TCS"),
                10,
                new BigDecimal("3500.00")
        );

        Holding holding2 = new Holding(
                2L,
                account,
                createInstrument("INFY"),
                20,
                new BigDecimal("1500.00")
        );

        repository.save("1", holding1);
        repository.save("1", holding2);

        List<Holding> result = repository.findByAccountId("1");

        assertEquals(2, result.size());
        assertSame(holding1, result.get(0));
        assertSame(holding2, result.get(1));
    }

    @Test
    void shouldKeepHoldingsForDifferentAccountsSeparate() {
        InMemoryHoldingRepository repository = new InMemoryHoldingRepository();

        Account account1 = createAccount(1L);
        Account account2 = createAccount(2L);

        Holding holding1 = new Holding(
                1L,
                account1,
                createInstrument("TCS"),
                10,
                new BigDecimal("3500.00")
        );

        Holding holding2 = new Holding(
                2L,
                account2,
                createInstrument("INFY"),
                20,
                new BigDecimal("1500.00")
        );

        repository.save("1", holding1);
        repository.save("2", holding2);

        List<Holding> account1Holdings =
                repository.findByAccountId("1");

        List<Holding> account2Holdings =
                repository.findByAccountId("2");

        assertEquals(1, account1Holdings.size());
        assertSame(holding1, account1Holdings.get(0));

        assertEquals(1, account2Holdings.size());
        assertSame(holding2, account2Holdings.get(0));
    }

    @Test
    void shouldReturnEmptyListForUnknownAccount() {
        InMemoryHoldingRepository repository = new InMemoryHoldingRepository();

        List<Holding> result =
                repository.findByAccountId("999");

        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    private Account createAccount(Long accountId) {
        User user = new User(
                accountId,
                "John",
                "Doe",
                "john" + accountId + "@example.com",
                "9876543210",
                "hashed-password",
                UserStatus.ACTIVE
        );

        return new Account(
                accountId,
                "ACC" + accountId,
                user,
                new BigDecimal("10000.00"),
                TradingStatus.ACTIVE,
                1L
        );
    }

    private Instrument createInstrument(String symbol) {
        return new Instrument(
                symbol,
                symbol + " Limited",
                AssetClass.EQUITY,
                "INR"
        );
    }
}