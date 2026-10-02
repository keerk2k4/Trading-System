package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.service.LatestPriceCache;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MarketDataConsumerTest {

    @Test
    void consumesEnvelopedQuoteIntoCache() {
        LatestPriceCache cache = new LatestPriceCache();
        MarketDataConsumer consumer = new MarketDataConsumer(new ObjectMapper(), cache);

        String message = """
                {"eventId":"3a5c7e91-2b4d-4f60-8c1e-9d0f2a4b6c8e","eventType":"QUOTE",
                "eventTime":"2026-09-28T09:15:00Z","source":"market-poller","schemaVersion":1,
                "payload":{"symbol":"AAPL","price":232.71,"bid":232.65,"ask":232.77,
                "currency":"USD","change":0.21,"changePercent":0.09,"previousClose":232.50,
                "marketState":"open","stale":false,"quoteAsOf":"2026-09-28T09:14:58Z"}}""";

        consumer.consumeMarketData(message);

        assertTrue(cache.get("AAPL").isPresent());
        assertEquals(new BigDecimal("232.71"), cache.get("AAPL").orElseThrow().price());
    }

    @Test
    void ignoresMessageWithoutSymbol() {
        LatestPriceCache cache = new LatestPriceCache();
        MarketDataConsumer consumer = new MarketDataConsumer(new ObjectMapper(), cache);

        consumer.consumeMarketData("""
                {"eventType":"QUOTE","payload":{"price":1,"bid":1,"ask":1}}""");

        assertEquals(0, cache.size());
    }
}
