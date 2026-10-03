package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.service.LatestPriceCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Consumes {@code market-data} QUOTE events and maintains the
 * {@link com.tradingsystem.spring_boot_app.service.LatestPriceCache}.
 *
 * <p>Group id {@code watchlist-service} follows contracts/kafka-topics.md: the
 * watchlist/positions read-model consumer. Offsets are independent from other
 * logical consumers. The Angular UI never talks to Kafka; it reads live prices
 * through the watchlist/positions REST responses enriched from the cache.
 */
@Component
public class MarketDataConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(MarketDataConsumer.class);

    private final ObjectMapper objectMapper;
    private final LatestPriceCache cache;

    public MarketDataConsumer(ObjectMapper objectMapper, LatestPriceCache cache) {
        this.objectMapper = objectMapper;
        this.cache = cache;
    }

    @KafkaListener(
            topics = "${app.kafka.topics.market-data:market-data}",
            groupId = "${app.kafka.groups.watchlist-service:watchlist-service}"
    )
    public void consumeMarketData(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            JsonNode payload = root.has("payload") ? root.path("payload") : root;

            String symbol = textOrNull(payload, "symbol");
            if (symbol == null || symbol.isBlank()) {
                LOGGER.warn("Ignoring market-data message without symbol");
                return;
            }

            QuotePayload quote = new QuotePayload(
                    symbol.trim().toUpperCase(),
                    decimalOrNull(payload, "price"),
                    decimalOrNull(payload, "bid"),
                    decimalOrNull(payload, "ask"),
                    textOrDefault(payload, "currency", "USD"),
                    decimalOrNull(payload, "change"),
                    decimalOrNull(payload, "changePercent"),
                    decimalOrNull(payload, "previousClose"),
                    textOrDefault(payload, "marketState", "unknown"),
                    payload.has("stale") && !payload.path("stale").isNull()
                            ? payload.path("stale").asBoolean(false) : false,
                    textOrDefault(payload, "quoteAsOf", "")
            );

            if (quote.price() == null || quote.bid() == null || quote.ask() == null) {
                LOGGER.warn("Ignoring market-data message for {} with missing price/bid/ask", symbol);
                return;
            }

            cache.update(quote);
            LOGGER.debug("Cached latest quote for {} price={}", quote.symbol(), quote.price());
        } catch (Exception e) {
            LOGGER.error("Failed processing market-data message", e);
            throw new IllegalStateException("Failed processing market-data message", e);
        }
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return (v.isMissingNode() || v.isNull()) ? null : v.asText();
    }

    private static String textOrDefault(JsonNode node, String field, String def) {
        String v = textOrNull(node, field);
        return (v == null || v.isBlank()) ? def : v;
    }

    private static BigDecimal decimalOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        try {
            return new BigDecimal(v.asText());
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
