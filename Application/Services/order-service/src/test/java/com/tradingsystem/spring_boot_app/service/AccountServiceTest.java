package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.OptimisticLockException;
import com.tradingsystem.spring_boot_app.dto.AccountResponse;
import com.tradingsystem.spring_boot_app.dto.AccountStatus;
import com.tradingsystem.spring_boot_app.dto.BalanceResponse;
import com.tradingsystem.spring_boot_app.dto.HoldingResponse;
import com.tradingsystem.spring_boot_app.dto.OrderHistoryEntry;
import com.tradingsystem.spring_boot_app.dto.OrderHistoryRow;
import com.tradingsystem.spring_boot_app.dto.PositionResponse;
import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.HoldingMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountMapper accounts;
    @Mock
    private PositionMapper positions;
    @Mock
    private OrderMapper orders;

    private AccountService service;

    @BeforeEach
    void setUp() {
        service = new AccountService(accounts, positions, orders, mock(HoldingMapper.class),
                new com.tradingsystem.spring_boot_app.service.LatestPriceCache());
    }

    @Test
    void getAccountMapsEntityAndHolderToApiResponse() {
        Account account = mock(Account.class);
        User holder = mock(User.class);
        when(holder.getFirstName()).thenReturn("Asha");
        when(holder.getLastName()).thenReturn("Rao");
        when(account.getAccountId()).thenReturn(7L);
        when(account.getAccountReference()).thenReturn("ACC-000007");
        when(account.getHolder()).thenReturn(holder);
        when(account.getCashBalance()).thenReturn(new BigDecimal("24500.75"));
        when(account.getTradingStatus()).thenReturn(TradingStatus.ACTIVE);
        when(account.getLoadedVersion()).thenReturn(3L);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));

        AccountResponse response = service.getAccount(7L);

        assertAll(
                () -> assertEquals(7L, response.id()),
                () -> assertEquals("ACC-000007", response.accountId()),
                () -> assertEquals("Asha Rao", response.holderName()),
                () -> assertEquals(new BigDecimal("24500.75"), response.cashBalance()),
                () -> assertEquals(AccountStatus.ACTIVE, response.status()),
                () -> assertEquals(3L, response.version())
        );
        assertNotNull(response.lastUpdated());
        assertEquals(ZoneOffset.UTC, response.lastUpdated().getOffset());
    }

    @Test
    void getAccountUsesFallbackHolderNameWhenHolderIsMissing() {
        Account account = mock(Account.class);
        when(account.getAccountId()).thenReturn(8L);
        when(account.getAccountReference()).thenReturn("ACC-000008");
        when(account.getHolder()).thenReturn(null);
        when(account.getCashBalance()).thenReturn(new BigDecimal("1000.00"));
        when(account.getTradingStatus()).thenReturn(TradingStatus.ACTIVE);
        when(account.getLoadedVersion()).thenReturn(1L);
        when(accounts.findAccountById(8L)).thenReturn(Optional.of(account));

        AccountResponse response = service.getAccount(8L);

        assertAll(
                () -> assertEquals(8L, response.id()),
                () -> assertEquals("ACC-000008", response.accountId()),
                () -> assertEquals("Unknown holder", response.holderName()),
                () -> assertEquals(new BigDecimal("1000.00"), response.cashBalance()),
                () -> assertEquals(AccountStatus.ACTIVE, response.status()),
                () -> assertEquals(1L, response.version())
        );
    }

    @Test
    void getBalanceReturnsUsdBalanceForExistingAccount() {
        Account account = mock(Account.class);
        when(account.getAccountId()).thenReturn(7L);
        when(account.getCashBalance()).thenReturn(new BigDecimal("88.10"));
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));

        BalanceResponse response = service.getBalance(7L);

        assertAll(
                () -> assertEquals(7L, response.accountId()),
                () -> assertEquals(new BigDecimal("88.10"), response.cashBalance()),
                () -> assertEquals("USD", response.currency())
        );
        assertNotNull(response.asOf());
    }

    @Test
    void updateBalancePersistsAndReturnsUsdBalanceForExistingAccount() {
        Account account = mock(Account.class);
        when(account.getLoadedVersion()).thenReturn(3L);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));
        when(accounts.updateAvailableBalanceOptimistic(7L, new BigDecimal("1500.25"), 3L)).thenReturn(1);

        BalanceResponse response = service.updateBalance(7L, new BigDecimal("1500.25"));

        assertAll(
                () -> assertEquals(7L, response.accountId()),
                () -> assertEquals(new BigDecimal("1500.25"), response.cashBalance()),
                () -> assertEquals("USD", response.currency())
        );
        assertNotNull(response.asOf());
    }

    @Test
    void updateBalanceThrowsConflictWhenVersionHasChanged() {
        Account account = mock(Account.class);
        when(account.getLoadedVersion()).thenReturn(9L);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));
        when(accounts.updateAvailableBalanceOptimistic(7L, new BigDecimal("250.00"), 9L)).thenReturn(0);

        OptimisticLockException failure = assertThrows(OptimisticLockException.class,
                () -> service.updateBalance(7L, new BigDecimal("250.00")));

        assertAll(
                () -> assertEquals("ORD-409", failure.getCode()),
                () -> assertEquals("Concurrent update detected", failure.getMessage()),
                () -> assertEquals(7L, failure.getAccountId())
        );
    }

    @Test
    void getPositionsMapsNestedAccountAndInstrumentFields() {
        Account account = mock(Account.class);
        when(account.getAccountId()).thenReturn(7L);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));

        Position position = mock(Position.class);
        Instrument instrument = mock(Instrument.class);
        when(position.getAccount()).thenReturn(account);
        when(position.getInstrument()).thenReturn(instrument);
        when(instrument.getSymbol()).thenReturn("ACME");
        when(position.getQuantity()).thenReturn(100);
        when(position.getAveragePrice()).thenReturn(new BigDecimal("25.50"));
        when(positions.findPositionsByAccountId(7L)).thenReturn(List.of(position));

        List<PositionResponse> result = service.getPositions(7L);

        assertEquals(List.of(new PositionResponse(7L, "ACME", 100, new BigDecimal("25.50"))), result);
    }

    @Test
    void getPositionsComputesUnrealizedPnlFromLivePrice() {
        LatestPriceCache cache = mock(LatestPriceCache.class);
        QuotePayload quote = mock(QuotePayload.class);
        when(quote.price()).thenReturn(new BigDecimal("27.00"));
        when(cache.get("ACME")).thenReturn(Optional.of(quote));
        service = new AccountService(accounts, positions, orders, mock(HoldingMapper.class), cache);

        Account account = mock(Account.class);
        when(account.getAccountId()).thenReturn(7L);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));
        Position position = mock(Position.class);
        Instrument instrument = mock(Instrument.class);
        when(position.getAccount()).thenReturn(account);
        when(position.getInstrument()).thenReturn(instrument);
        when(instrument.getSymbol()).thenReturn("ACME");
        when(position.getQuantity()).thenReturn(100);
        when(position.getAveragePrice()).thenReturn(new BigDecimal("25.00"));
        when(positions.findPositionsByAccountId(7L)).thenReturn(List.of(position));

        PositionResponse result = service.getPositions(7L).getFirst();

        assertAll(
                () -> assertEquals(new BigDecimal("2700.00"), result.marketValue()),
                () -> assertEquals(new BigDecimal("200.00"), result.unrealizedPnl()),
                () -> assertEquals(new BigDecimal("8.00"), result.unrealizedPnlPercent())
        );
    }

    @Test
    void getOrdersPassesRecordedRealizedPnlThrough() {
        Account account = mock(Account.class);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 1, 9, 0);
        OrderHistoryRow sell = new OrderHistoryRow("ORD-3", 7L, "ACME", OrderSide.SELL, OrderType.LIMIT, 2,
                new BigDecimal("96.00"), new BigDecimal("96.00"), OrderStatus.FILLED, "k3", createdAt,
                new BigDecimal("-0.50"), new BigDecimal("-0.26"));
        when(orders.findOrderHistoryByAccountId(7L)).thenReturn(List.of(sell, row("ORD-1", OrderStatus.FILLED, createdAt)));

        List<OrderHistoryEntry> result = service.getOrders(7L, null, null, null);

        assertAll(
                () -> assertEquals(new BigDecimal("-0.50"), result.get(0).realizedPnl()),
                () -> assertEquals(new BigDecimal("-0.26"), result.get(0).realizedPnlPercent()),
                () -> assertNull(result.get(1).realizedPnl()),
                () -> assertNull(result.get(1).realizedPnlPercent())
        );
    }

    @Test
    void getOrdersMapsRowsAndAppliesOptionalStatusFilter() {
        Account account = mock(Account.class);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));

        LocalDateTime createdAt = LocalDateTime.of(2026, 9, 28, 9, 14, 22);
        OrderHistoryRow filledRow = row("ORD-filled", OrderStatus.FILLED, createdAt);
        OrderHistoryRow cancelledRow = row("ORD-cancelled", OrderStatus.CANCELLED, null);
        when(orders.findOrderHistoryByAccountId(7L)).thenReturn(List.of(filledRow, cancelledRow));

        List<OrderHistoryEntry> all = service.getOrders(7L, null, null, null);
        List<OrderHistoryEntry> filled = service.getOrders(7L, OrderStatus.FILLED, null, null);
        List<OrderHistoryEntry> cancelled = service.getOrders(7L, OrderStatus.CANCELLED, null, null);

        assertAll(
                () -> assertEquals(List.of("ORD-filled", "ORD-cancelled"),
                        all.stream().map(OrderHistoryEntry::orderId).toList()),
                () -> assertEquals("ORD-filled", filled.getFirst().orderId()),
                () -> assertEquals(1, filled.size()),
                () -> assertEquals("ORD-cancelled", cancelled.getFirst().orderId()),
                () -> assertEquals(1, cancelled.size()),
                () -> assertEquals(OffsetDateTime.parse("2026-09-28T09:14:22Z"), filled.getFirst().createdOn())
        );
        assertAll(
                () -> assertNotNull(cancelled.getFirst().createdOn()),
                () -> assertEquals(ZoneOffset.UTC, cancelled.getFirst().createdOn().getOffset())
        );
    }

    @Test
    void missingAccountStopsReadBeforeCallingOtherMappers() {
        when(accounts.findAccountById(9L)).thenReturn(Optional.empty());

        AccountNotFoundException failure = assertThrows(AccountNotFoundException.class,
                () -> service.getPositions(9L));

        assertAll(
                () -> assertEquals(9L, failure.getAccountId()),
                () -> assertEquals("ACC-404", failure.getCode()),
                () -> assertEquals("Account not found", failure.getMessage())
        );
        verifyNoInteractions(positions, orders);
    }

    @Test
    void getHoldingsMapsEntitiesWithLivePrice() {
        LatestPriceCache cache = mock(LatestPriceCache.class);
        QuotePayload quote = mock(QuotePayload.class);
        when(quote.price()).thenReturn(new BigDecimal("30.00"));
        when(cache.get("ACME")).thenReturn(Optional.of(quote));
        HoldingMapper holdings = mock(HoldingMapper.class);
        service = new AccountService(accounts, positions, orders, holdings, cache);

        Account account = mock(Account.class);
        when(account.getAccountId()).thenReturn(7L);
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account));
        Holding holding = mock(Holding.class);
        Instrument instrument = mock(Instrument.class);
        when(holding.getAccount()).thenReturn(account);
        when(holding.getInstrument()).thenReturn(instrument);
        when(instrument.getSymbol()).thenReturn("ACME");
        when(holding.getQuantity()).thenReturn(50);
        when(holding.getAveragePrice()).thenReturn(new BigDecimal("25.00"));
        when(holdings.findHoldingsByAccountId(7L)).thenReturn(List.of(holding));

        List<HoldingResponse> result = service.getHoldings(7L);

        assertAll(
                () -> assertEquals(1, result.size()),
                () -> assertEquals("ACME", result.get(0).symbol()),
                () -> assertEquals(50, result.get(0).quantity()),
                () -> assertEquals(new BigDecimal("1500.00"), result.get(0).marketValue()),
                () -> assertEquals(new BigDecimal("250.00"), result.get(0).unrealizedPnl()),
                () -> assertEquals(new BigDecimal("20.00"), result.get(0).unrealizedPnlPercent())
        );
    }

    private static OrderHistoryRow row(String orderId, OrderStatus status, LocalDateTime createdOn) {
        return new OrderHistoryRow(
                orderId,
                7L,
                "ACME",
                OrderSide.BUY,
                OrderType.LIMIT,
                100,
                new BigDecimal("25.50"),
                new BigDecimal("25.48"),
                status,
                "key-" + orderId,
                createdOn,
                null,
                null);
    }
}
