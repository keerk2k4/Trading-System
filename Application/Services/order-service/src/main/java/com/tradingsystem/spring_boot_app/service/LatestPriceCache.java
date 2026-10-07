package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory latest-quote cache fed by the {@code market-data} Kafka topic.
 *
 * <p>Holds only the newest {@link QuotePayload} per symbol:
 * {@code Map<symbol, latestQuote>}. A new message for a symbol replaces the
 * previous value; no history is kept and nothing is written to PostgreSQL.
 * Persistent data (users, accounts, watchlists, positions, orders,
 * instruments) stays in the database; {@code price}/{@code change}/
 * {@code changePercent} always come from here.
 *
 * <p>It also records when each symbol's quote last arrived, so a reader can
 * tell a quote the poller refreshed a minute ago from one left behind when
 * the poller stopped.
 */
@Component
public class LatestPriceCache {

    private final ConcurrentHashMap<String, QuotePayload> latestBySymbol = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Instant> receivedAtBySymbol = new ConcurrentHashMap<>();
    private final Clock clock;

    public LatestPriceCache() {
        this(Clock.systemUTC());
    }

    public LatestPriceCache(Clock clock) {
        this.clock = clock;
    }

    public void update(QuotePayload quote) {
        if (quote == null || quote.symbol() == null || quote.symbol().isBlank()) {
            return;
        }
        String key = quote.symbol().trim().toUpperCase();
        latestBySymbol.put(key, quote);
        receivedAtBySymbol.put(key, clock.instant());
    }

    public Optional<QuotePayload> get(String symbol) {
        if (symbol == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(latestBySymbol.get(symbol.trim().toUpperCase()));
    }

    /** When the current quote for the symbol arrived, or empty if none has. */
    public Optional<Instant> receivedAt(String symbol) {
        if (symbol == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(receivedAtBySymbol.get(symbol.trim().toUpperCase()));
    }

    /** Arrival time of the most recent quote for any symbol, or empty if none has arrived. */
    public Optional<Instant> lastReceivedAt() {
        return receivedAtBySymbol.values().stream().max(Instant::compareTo);
    }

    public Map<String, QuotePayload> snapshot() {
        return Map.copyOf(latestBySymbol);
    }

    public int size() {
        return latestBySymbol.size();
    }
}
