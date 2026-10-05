package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import org.springframework.stereotype.Component;

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
 */
@Component
public class LatestPriceCache {

    private final ConcurrentHashMap<String, QuotePayload> latestBySymbol = new ConcurrentHashMap<>();

    public void update(QuotePayload quote) {
        if (quote == null || quote.symbol() == null || quote.symbol().isBlank()) {
            return;
        }
        latestBySymbol.put(quote.symbol().trim().toUpperCase(), quote);
    }

    public Optional<QuotePayload> get(String symbol) {
        if (symbol == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(latestBySymbol.get(symbol.trim().toUpperCase()));
    }

    public Map<String, QuotePayload> snapshot() {
        return Map.copyOf(latestBySymbol);
    }

    public int size() {
        return latestBySymbol.size();
    }
}
