package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

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
    void symbolsAreCaseInsensitive() {
        LatestPriceCache cache = new LatestPriceCache();
        cache.update(quote("aapl", "200.10"));

        assertTrue(cache.get("AAPL").isPresent());
        assertTrue(cache.get("aapl").isPresent());
    }
}
