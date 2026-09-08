
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
import java.util.Optional;

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
    void shouldFindPositionByAccountIdInstrumentAndProductType() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Position position = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", position);

        Optional<Position> result =
                repository.findByAccountIdAndInstrumentAndProductType(
                        "1",
                        instrument,
                        ProductType.INTRADAY
                );

        assertTrue(result.isPresent());
        assertSame(position, result.get());
    }

    @Test
    void shouldReturnEmptyWhenPositionDoesNotMatchProductType() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Position position = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", position);

        Optional<Position> result =
                repository.findByAccountIdAndInstrumentAndProductType(
                        "1",
                        instrument,
                        ProductType.DELIVERY
                );

        assertTrue(result.isEmpty());
    }

    @Test
    void shouldReturnEmptyWhenPositionDoesNotMatchInstrument() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);
        Instrument tcs = createInstrument("TCS");
        Instrument infy = createInstrument("INFY");

        Position position = new Position(
                account,
                tcs,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", position);

        Optional<Position> result =
                repository.findByAccountIdAndInstrumentAndProductType(
                        "1",
                        infy,
                        ProductType.INTRADAY
                );

        assertTrue(result.isEmpty());
    }

    @Test
    void shouldStoreMultiplePositionsForDifferentInstruments() {
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
    void shouldAllowSameInstrumentForDifferentProductTypes() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Position intradayPosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        Position deliveryPosition = new Position(
                account,
                instrument,
                ProductType.DELIVERY,
                20,
                new BigDecimal("3600.00")
        );

        repository.save("1", intradayPosition);
        repository.save("1", deliveryPosition);

        List<Position> result = repository.findByAccountId("1");

        assertEquals(2, result.size());
        assertSame(intradayPosition, result.get(0));
        assertSame(deliveryPosition, result.get(1));
    }

    @Test
    void shouldNotAddDuplicatePositionForSameAccountInstrumentAndProductType() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Position existingPosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        Position duplicatePosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                20,
                new BigDecimal("3600.00")
        );

        repository.save("1", existingPosition);
        repository.save("1", duplicatePosition);

        List<Position> result = repository.findByAccountId("1");

        assertEquals(1, result.size());
        assertSame(existingPosition, result.get(0));
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

    @Test
    void shouldReturnEmptyWhenFindingPositionForUnknownAccount() {
        InMemoryPositionRepository repository = new InMemoryPositionRepository();

        Instrument instrument = createInstrument("TCS");

        Optional<Position> result =
                repository.findByAccountIdAndInstrumentAndProductType(
                        "999",
                        instrument,
                        ProductType.INTRADAY
                );

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

