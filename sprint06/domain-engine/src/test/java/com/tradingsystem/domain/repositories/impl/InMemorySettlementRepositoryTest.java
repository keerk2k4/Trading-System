package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Settlement;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class InMemorySettlementRepositoryTest {

    @Test
    void shouldSaveAndFindSettlementByAccountId() {
        InMemorySettlementRepository repository =
                new InMemorySettlementRepository();

        Account account = createAccount(1L);
        Instrument instrument = createInstrument("TCS");

        Settlement settlement = new Settlement(
                1L,
                account,
                instrument,
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", settlement);

        List<Settlement> result =
                repository.findByAccountId("1");

        assertEquals(1, result.size());
        assertSame(settlement, result.get(0));
    }

    @Test
    void shouldStoreMultipleSettlementsForSameAccount() {
        InMemorySettlementRepository repository =
                new InMemorySettlementRepository();

        Account account = createAccount(1L);

        Settlement settlement1 = new Settlement(
                1L,
                account,
                createInstrument("TCS"),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        Settlement settlement2 = new Settlement(
                2L,
                account,
                createInstrument("INFY"),
                ProductType.DELIVERY,
                20,
                new BigDecimal("1500.00")
        );

        repository.save("1", settlement1);
        repository.save("1", settlement2);

        List<Settlement> result =
                repository.findByAccountId("1");

        assertEquals(2, result.size());
        assertSame(settlement1, result.get(0));
        assertSame(settlement2, result.get(1));
    }

    @Test
    void shouldKeepSettlementsForDifferentAccountsSeparate() {
        InMemorySettlementRepository repository =
                new InMemorySettlementRepository();

        Account account1 = createAccount(1L);
        Account account2 = createAccount(2L);

        Settlement settlement1 = new Settlement(
                1L,
                account1,
                createInstrument("TCS"),
                ProductType.DELIVERY,
                10,
                new BigDecimal("3500.00")
        );

        Settlement settlement2 = new Settlement(
                2L,
                account2,
                createInstrument("INFY"),
                ProductType.DELIVERY,
                20,
                new BigDecimal("1500.00")
        );

        repository.save("1", settlement1);
        repository.save("2", settlement2);

        List<Settlement> account1Settlements =
                repository.findByAccountId("1");

        List<Settlement> account2Settlements =
                repository.findByAccountId("2");

        assertEquals(1, account1Settlements.size());
        assertSame(settlement1, account1Settlements.get(0));

        assertEquals(1, account2Settlements.size());
        assertSame(settlement2, account2Settlements.get(0));
    }

    @Test
    void shouldReturnEmptyListForUnknownAccount() {
        InMemorySettlementRepository repository =
                new InMemorySettlementRepository();

        List<Settlement> result =
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