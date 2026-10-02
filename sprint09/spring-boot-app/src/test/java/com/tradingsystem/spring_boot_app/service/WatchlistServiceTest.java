package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.spring_boot_app.dto.WatchlistResponse;
import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.InstrumentMapper;
import com.tradingsystem.spring_boot_app.mapper.WatchlistMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WatchlistServiceTest {

    @Mock
    private WatchlistMapper watchlists;
    @Mock
    private AccountMapper accounts;
    @Mock
    private InstrumentMapper instruments;

    private LatestPriceCache prices;
    private WatchlistService service;

    private static final String USER_ID = "550e8400-e29b-41d4-a716-446655440001";

    @BeforeEach
    void setUp() {
        prices = new LatestPriceCache();
        service = new WatchlistService(watchlists, accounts, instruments, prices);
    }

    private Account account() {
        User holder = new User(USER_ID, "Priya", "Menon", "p@example.com", null, "hash", UserStatus.ACTIVE);
        return new Account(1L, "ACC-1", holder, new BigDecimal("1000.00"), TradingStatus.ACTIVE, 0L);
    }

    @Test
    void getWatchlistsCreatesDefaultWhenMissing() {
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account()));
        when(watchlists.findDefaultWatchlistByUserId(USER_ID)).thenReturn(Optional.empty());
        when(watchlists.findWatchlistsByUserId(USER_ID)).thenReturn(List.of(
                new WatchlistMapper.WatchlistRow(7L, USER_ID, "Default", true)));
        when(watchlists.findInstrumentsByWatchlistId(7L)).thenReturn(List.of());

        List<WatchlistResponse> result = service.getWatchlists(1L);

        assertEquals(1, result.size());
        assertTrue(result.get(0).isDefault());
    }

    @Test
    void watchlistDetailUsesCachedLivePrice() {
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account()));
        when(watchlists.findWatchlistById(7L)).thenReturn(
                Optional.of(new WatchlistMapper.WatchlistRow(7L, USER_ID, "Default", true)));
        when(watchlists.findInstrumentsByWatchlistId(7L)).thenReturn(
                List.of(new WatchlistMapper.WatchlistInstrumentRow("AAPL", "Apple Inc.")));
        prices.update(new QuotePayload("AAPL", new BigDecimal("245.30"), new BigDecimal("245.20"),
                new BigDecimal("245.40"), "USD", new BigDecimal("1.25"), new BigDecimal("0.51"),
                new BigDecimal("244.05"), "open", false, "2026-09-28T09:14:58Z"));

        var detail = service.getWatchlist(1L, 7L);

        assertEquals(1, detail.stocks().size());
        assertEquals(new BigDecimal("245.30"), detail.stocks().get(0).price());
        assertEquals(new BigDecimal("1.25"), detail.stocks().get(0).change());
    }

    @Test
    void watchlistDetailFallsBackToReferencePriceWithoutQuote() {
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account()));
        when(watchlists.findWatchlistById(7L)).thenReturn(
                Optional.of(new WatchlistMapper.WatchlistRow(7L, USER_ID, "Default", true)));
        when(watchlists.findInstrumentsByWatchlistId(7L)).thenReturn(
                List.of(new WatchlistMapper.WatchlistInstrumentRow("AAPL", "Apple Inc.")));
        when(watchlists.findReferencePriceBySymbol("AAPL")).thenReturn(Optional.of(new BigDecimal("224.12")));

        var detail = service.getWatchlist(1L, 7L);

        assertEquals(new BigDecimal("224.12"), detail.stocks().get(0).price());
    }

    @Test
    void addInstrumentIsIdempotentViaOnConflict() {
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account()));
        when(watchlists.findWatchlistById(7L)).thenReturn(
                Optional.of(new WatchlistMapper.WatchlistRow(7L, USER_ID, "Default", true)));
        Instrument aapl = new Instrument(1L, "AAPL", "Apple Inc.", AssetClass.EQUITY, "USD");
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(aapl));
        when(watchlists.findInstrumentIdBySymbol("AAPL")).thenReturn(Optional.of(1L));
        when(watchlists.findReferencePriceBySymbol("AAPL")).thenReturn(Optional.of(new BigDecimal("224.12")));

        var added = service.addInstrument(1L, 7L, "aapl");

        assertEquals("AAPL", added.symbol());
    }
}
