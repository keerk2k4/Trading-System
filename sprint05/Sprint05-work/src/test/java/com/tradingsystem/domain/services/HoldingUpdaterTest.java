package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Settlement;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.domain.repositories.impl.InMemoryHoldingRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class HoldingUpdaterTest {

    @Test
    void shouldCreateHoldingWhenHoldingDoesNotExist() {

        InMemoryHoldingRepository repository =
                new InMemoryHoldingRepository();

        HoldingUpdater holdingUpdater =
                new HoldingUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Settlement settlement = new Settlement(
                1L,
                account,
                instrument,
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        holdingUpdater.update(settlement);

        Holding holding =
                repository.findByAccountIdAndInstrument(
                        "1",
                        instrument
                ).orElseThrow();

        assertEquals(10, holding.getQuantity());

        assertEquals(
                new BigDecimal("3500.00"),
                holding.getAveragePrice()
        );
    }

    @Test
    void shouldUpdateExistingHoldingWhenHoldingAlreadyExists() {

        InMemoryHoldingRepository repository =
                new InMemoryHoldingRepository();

        HoldingUpdater holdingUpdater =
                new HoldingUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Holding existingHolding = new Holding(
                1L,
                account,
                instrument,
                10,
                new BigDecimal("3000.00")
        );

        repository.save("1", existingHolding);

        Settlement settlement = new Settlement(
                2L,
                account,
                instrument,
                ProductType.DELIVERY,
                10,
                new BigDecimal("4000.00")
        );

        holdingUpdater.update(settlement);

        assertEquals(
                20,
                existingHolding.getQuantity()
        );

        assertEquals(
                new BigDecimal("3500.00"),
                existingHolding.getAveragePrice()
        );
    }

    @Test
    void shouldNotCreateDuplicateHolding() {

        InMemoryHoldingRepository repository =
                new InMemoryHoldingRepository();

        HoldingUpdater holdingUpdater =
                new HoldingUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Holding existingHolding = new Holding(
                1L,
                account,
                instrument,
                10,
                new BigDecimal("3000.00")
        );

        repository.save("1", existingHolding);

        Settlement settlement = new Settlement(
                2L,
                account,
                instrument,
                ProductType.DELIVERY,
                5,
                new BigDecimal("4000.00")
        );

        holdingUpdater.update(settlement);

        assertEquals(
                1,
                repository.findByAccountId("1").size()
        );

        assertEquals(
                15,
                existingHolding.getQuantity()
        );
    }

    @Test
    void shouldCreateSeparateHoldingForDifferentInstrument() {

        InMemoryHoldingRepository repository =
                new InMemoryHoldingRepository();

        HoldingUpdater holdingUpdater =
                new HoldingUpdater(repository);

        Account account = createAccount();

        Instrument tcs = createInstrument("TCS");
        Instrument infy = createInstrument("INFY");

        Settlement settlement = new Settlement(
                1L,
                account,
                tcs,
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        holdingUpdater.update(settlement);

        Settlement secondSettlement = new Settlement(
                2L,
                account,
                infy,
                ProductType.DELIVERY,
                5,
                new BigDecimal("1500.00")
        );

        holdingUpdater.update(secondSettlement);

        assertEquals(
                2,
                repository.findByAccountId("1").size()
        );

        assertEquals(
                10,
                repository.findByAccountIdAndInstrument(
                        "1",
                        tcs
                ).orElseThrow().getQuantity()
        );

        assertEquals(
                5,
                repository.findByAccountIdAndInstrument(
                        "1",
                        infy
                ).orElseThrow().getQuantity()
        );
    }

    @Test
    void shouldKeepHoldingsSeparateForDifferentAccounts() {

        InMemoryHoldingRepository repository =
                new InMemoryHoldingRepository();

        HoldingUpdater holdingUpdater =
                new HoldingUpdater(repository);

        Account firstAccount = createAccount(1L);
        Account secondAccount = createAccount(2L);

        Instrument instrument = createInstrument();

        Settlement firstSettlement = new Settlement(
                1L,
                firstAccount,
                instrument,
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        Settlement secondSettlement = new Settlement(
                2L,
                secondAccount,
                instrument,
                ProductType.DELIVERY,
                20,
                new BigDecimal("3500.00")
        );

        holdingUpdater.update(firstSettlement);
        holdingUpdater.update(secondSettlement);

        assertEquals(
                10,
                repository.findByAccountIdAndInstrument(
                        "1",
                        instrument
                ).orElseThrow().getQuantity()
        );

        assertEquals(
                20,
                repository.findByAccountIdAndInstrument(
                        "2",
                        instrument
                ).orElseThrow().getQuantity()
        );
    }

    private Account createAccount() {
        return createAccount(1L);
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

    private Instrument createInstrument() {
        return createInstrument("TCS");
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