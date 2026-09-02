package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class InMemoryPositionRepositoryTest {

    @Test
    void shouldSaveAndFindPositionByAccountId() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Position position = new Position(
                account,
                instrument,
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", position);

        List<Position> result = repository.findByAccountId("1");

        assertEquals(1, result.size());
        assertSame(position, result.get(0));
    }

    @Test
    void shouldStoreMultiplePositionsForSameAccount() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);

        Position position1 = new Position(
                account,
                createInstrument("TCS"),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        Position position2 = new Position(
                account,
                createInstrument("INFY"),
                ProductType.INTRADAY,
                20,
                new BigDecimal("1500.00")
        );

        repository.save("1", position1);
        repository.save("1", position2);

        List<Position> result = repository.findByAccountId("1");

        assertEquals(2, result.size());
        assertSame(position1, result.get(0));
        assertSame(position2, result.get(1));
    }

    @Test
    void shouldKeepPositionsForDifferentAccountsSeparate() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account1 = createAccount(1L);
        Account account2 = createAccount(2L);

        Position position1 = new Position(
                account1,
                createInstrument("TCS"),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        Position position2 = new Position(
                account2,
                createInstrument("INFY"),
                ProductType.DELIVERY,
                20,
                new BigDecimal("1500.00")
        );

        repository.save("1", position1);
        repository.save("2", position2);

        List<Position> account1Positions =
                repository.findByAccountId("1");

        List<Position> account2Positions =
                repository.findByAccountId("2");

        assertEquals(1, account1Positions.size());
        assertSame(position1, account1Positions.get(0));

        assertEquals(1, account2Positions.size());
        assertSame(position2, account2Positions.get(0));
    }

    @Test
    void shouldReturnEmptyListForUnknownAccount() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        List<Position> result =
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