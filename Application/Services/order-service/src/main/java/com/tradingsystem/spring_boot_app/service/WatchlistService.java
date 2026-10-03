package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.spring_boot_app.dto.InstrumentResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistDetailResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistStockResponse;
import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.InstrumentMapper;
import com.tradingsystem.spring_boot_app.mapper.WatchlistMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Database-backed watchlists. Membership lives in
 * trading.watchlist / trading.watchlist_inst; live prices come from
 * {@link LatestPriceCache} (Kafka market-data) and are never persisted.
 */
@Service
public class WatchlistService {

    private static final Logger LOGGER = LoggerFactory.getLogger(WatchlistService.class);

    public static final String DEFAULT_NAME = "Default";
    private static final int MAX_NAME_LENGTH = 60;
    /**
     * Core tradable universe. Matches seed instruments and the Fauxnance
     * poller universe, so a fresh default watchlist is polled for live
     * prices from the very first cycle even before the user holds positions.
     */
    private static final List<String> DEFAULT_SYMBOLS =
            List.of("AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX");

    private final WatchlistMapper watchlists;
    private final AccountMapper accounts;
    private final InstrumentMapper instruments;
    private final LatestPriceCache prices;

    public WatchlistService(WatchlistMapper watchlists, AccountMapper accounts,
                            InstrumentMapper instruments, LatestPriceCache prices) {
        this.watchlists = watchlists;
        this.accounts = accounts;
        this.instruments = instruments;
        this.prices = prices;
    }

    /** Resolve the auth-user UUID that owns the given trading account. */
    public String userIdForAccount(long accountId) {
        Account account = accounts.findAccountById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        if (account.getHolder() != null && account.getHolder().getUserId() != null) {
            return account.getHolder().getUserId();
        }
        return accounts.findUserIdByAccountId(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureDefaultWatchlist(String userId) {
        Optional<WatchlistMapper.WatchlistRow> existing =
                watchlists.findDefaultWatchlistByUserId(userId);
        if (existing.isPresent()) {
            seedDefaultSymbols(existing.get().watchlistId());
            return;
        }
        // A legacy named list may already exist; adopt it rather than duplicating.
        List<WatchlistMapper.WatchlistRow> all = watchlists.findWatchlistsByUserId(userId);
        for (WatchlistMapper.WatchlistRow row : all) {
            if (DEFAULT_NAME.equalsIgnoreCase(row.watchlistName())) {
                seedDefaultSymbols(row.watchlistId());
                return;
            }
        }
        Long watchlistId;
        try {
            watchlistId = watchlists.nextWatchlistId();
            watchlists.insertWatchlist(watchlistId, userId,
                    DEFAULT_NAME, "Default watchlist", true);
        } catch (DuplicateKeyException dup) {
            // Concurrent creation won the race, or a MAX+1 PK collision:
            LOGGER.debug("Default watchlist race for user {}", userId, dup);
            return;
        } catch (DataIntegrityViolationException e) {
            // FK / constraint problem (e.g. 016 not applied yet): degrade to
            // existing lists instead of failing the whole request with 500.
            LOGGER.warn("Skipping default watchlist creation for user {}", userId, e);
            return;
        }
        seedDefaultSymbols(watchlistId);
    }

    private void seedDefaultSymbols(Long watchlistId) {
        for (String symbol : DEFAULT_SYMBOLS) {
            try {
                watchlists.findInstrumentIdBySymbol(symbol).ifPresent(
                        instrumentId -> watchlists.insertWatchlistInstrument(watchlistId, instrumentId));
            } catch (Exception e) {
                LOGGER.warn("Skipping default symbol {} for watchlist {}", symbol, watchlistId, e);
            }
        }
    }

    @Transactional
    public List<WatchlistResponse> getWatchlists(long accountId) {
        String userId = userIdForAccount(accountId);
        ensureDefaultWatchlist(userId);
        List<WatchlistResponse> out = new ArrayList<>();
        for (WatchlistMapper.WatchlistRow row : watchlists.findWatchlistsByUserId(userId)) {
            boolean isDefault = Boolean.TRUE.equals(row.isDefault())
                    || DEFAULT_NAME.equalsIgnoreCase(row.watchlistName());
            List<String> symbols = watchlists.findInstrumentsByWatchlistId(row.watchlistId())
                    .stream().map(WatchlistMapper.WatchlistInstrumentRow::symbol).toList();
            out.add(new WatchlistResponse(row.watchlistId(), row.watchlistName(), isDefault, symbols));
        }
        return out;
    }

    @Transactional
    public WatchlistResponse createWatchlist(long accountId, String rawName) {
        String userId = userIdForAccount(accountId);
        ensureDefaultWatchlist(userId);
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) {
            throw new com.tradingsystem.exception.InvalidOrderArgumentException("name", rawName);
        }
        if (name.length() > MAX_NAME_LENGTH) {
            throw new com.tradingsystem.exception.InvalidOrderArgumentException("name", name);
        }
        try {
            Long id = watchlists.nextWatchlistId();
            watchlists.insertWatchlist(id, userId, name, null, false);
            return new WatchlistResponse(id, name, false, List.of());
        } catch (DuplicateKeyException dup) {
            throw new DuplicateKeyException("A watchlist with that name already exists.");
        }
    }

    @Transactional(readOnly = true)
    public WatchlistDetailResponse getWatchlist(long accountId, long watchlistId) {
        WatchlistMapper.WatchlistRow row = ownedWatchlist(accountId, watchlistId);
        boolean isDefault = Boolean.TRUE.equals(row.isDefault())
                || DEFAULT_NAME.equalsIgnoreCase(row.watchlistName());
        List<WatchlistStockResponse> stocks = new ArrayList<>();
        for (WatchlistMapper.WatchlistInstrumentRow inst
                : watchlists.findInstrumentsByWatchlistId(watchlistId)) {
            stocks.add(toStock(inst.symbol(), inst.displayName()));
        }
        return new WatchlistDetailResponse(row.watchlistId(), row.watchlistName(), isDefault, stocks);
    }

    @Transactional
    public void deleteWatchlist(long accountId, long watchlistId) {
        WatchlistMapper.WatchlistRow row = ownedWatchlist(accountId, watchlistId);
        boolean isDefault = Boolean.TRUE.equals(row.isDefault())
                || DEFAULT_NAME.equalsIgnoreCase(row.watchlistName());
        if (isDefault) {
            throw new com.tradingsystem.spring_boot_app.exception.DefaultWatchlistProtectedException();
        }
        watchlists.deleteAllWatchlistInstruments(watchlistId);
        watchlists.deleteWatchlist(watchlistId);
    }

    @Transactional
    public WatchlistStockResponse addInstrument(long accountId, long watchlistId, String rawSymbol) {
        WatchlistMapper.WatchlistRow row = ownedWatchlist(accountId, watchlistId);
        String symbol = rawSymbol == null ? "" : rawSymbol.trim().toUpperCase();
        if (symbol.isEmpty()) {
            throw new com.tradingsystem.exception.InvalidOrderArgumentException("symbol", rawSymbol);
        }
        var instrument = instruments.findInstrumentBySymbol(symbol)
                .orElseThrow(() -> new com.tradingsystem.exception.InstrumentNotFoundException(symbol));
        Long instrumentId = watchlists.findInstrumentIdBySymbol(symbol)
                .orElseThrow(() -> new com.tradingsystem.exception.InstrumentNotFoundException(symbol));
        watchlists.insertWatchlistInstrument(row.watchlistId(), instrumentId);
        return toStock(instrument.getSymbol(), instrument.getDisplayName());
    }

    @Transactional
    public void removeInstrument(long accountId, long watchlistId, String rawSymbol) {
        WatchlistMapper.WatchlistRow row = ownedWatchlist(accountId, watchlistId);
        String symbol = rawSymbol == null ? "" : rawSymbol.trim().toUpperCase();
        if (!symbol.isEmpty()) {
            watchlists.deleteWatchlistInstrumentBySymbol(row.watchlistId(), symbol);
        }
    }

    @Transactional(readOnly = true)
    public List<InstrumentResponse> searchInstruments(String query) {
        String q = query == null ? "" : query.trim().toLowerCase();
        // Blank query returns the full tradable catalog so the Angular UI can
        // fetch it once and filter synchronously for typeahead search.
        List<InstrumentResponse> out = new ArrayList<>();
        for (var inst : instruments.findInstrumentsByStatus("ACTIVE")) {
            if (inst.getSymbol().toLowerCase().contains(q)
                    || inst.getDisplayName().toLowerCase().contains(q)) {
                WatchlistStockResponse stock = toStock(inst.getSymbol(), inst.getDisplayName());
                out.add(new InstrumentResponse(stock.symbol(), stock.name(), stock.price(),
                        stock.change(), stock.changePercent()));
            }
        }
        return out;
    }

    private WatchlistMapper.WatchlistRow ownedWatchlist(long accountId, long watchlistId) {
        String userId = userIdForAccount(accountId);
        WatchlistMapper.WatchlistRow row = watchlists.findWatchlistById(watchlistId)
                .orElseThrow(() -> new java.util.NoSuchElementException("Watchlist not found: " + watchlistId));
        if (!userId.equals(row.userId())) {
            throw new AccountNotActiveException(accountId);
        }
        return row;
    }

    private WatchlistStockResponse toStock(String symbol, String displayName) {
        Optional<QuotePayload> cached = prices.get(symbol);
        if (cached.isPresent()) {
            QuotePayload q = cached.get();
            return new WatchlistStockResponse(symbol, displayName, q.price(),
                    q.change() != null ? q.change() : BigDecimal.ZERO,
                    q.changePercent() != null ? q.changePercent() : BigDecimal.ZERO);
        }
        // No live quote yet: fall back to the reference price in trading.instruments.price.
        BigDecimal price = watchlists.findReferencePriceBySymbol(symbol).orElse(BigDecimal.ZERO);
        return new WatchlistStockResponse(symbol, displayName, price, BigDecimal.ZERO, BigDecimal.ZERO);
    }
}
