package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LatestPriceCacheTest {

    private QuotePayload quote(String symbol, String price) {
        return new QuotePayload(symbol, new BigDecimal(price), new BigDecimal(price),
                new BigDecimal(price), "USD", BigDecimal.ZERO, BigDecimal.ZERO,
                null, "open", false, "2026-09-28T09:14:58Z");
    }

    @Test
    void latestQuoteReplacesPreviousValue() {
        LatestPriceCache cache = new LatestPriceCache();
        cache.update(quote("AAPL", "200.10"));
        cache.update(quote("AAPL", "200.20"));

        assertTrue(cache.get("AAPL").isPresent());
        assertEquals(new BigDecimal("200.20"), cache.get("AAPL").orElseThrow().price());
        assertEquals(1, cache.size());
    }

    @Test
    void recordsWhenEachQuoteArrived() {
        Instant first = Instant.parse("2026-10-07T14:00:00Z");
        Instant second = first.plusSeconds(120);
        AtomicReference<Instant> now = new AtomicReference<>(first);
        LatestPriceCache cache = new LatestPriceCache(new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return now.get(); }
        });

        assertTrue(cache.lastReceivedAt().isEmpty());
        cache.update(quote("AAPL", "200.10"));
        now.set(second);
        cache.update(quote("MSFT", "400.00"));

        assertEquals(first, cache.receivedAt("aapl").orElseThrow());
        assertEquals(second, cache.receivedAt("MSFT").orElseThrow());
        assertEquals(second, cache.lastReceivedAt().orElseThrow());
        assertTrue(cache.receivedAt("NVDA").isEmpty());
    }

    @Test
    void symbolsAreCaseInsensitive() {
        LatestPriceCache cache = new LatestPriceCache();
        cache.update(quote("aapl", "200.10"));

        assertTrue(cache.get("AAPL").isPresent());
        assertTrue(cache.get("aapl").isPresent());
    }
}
