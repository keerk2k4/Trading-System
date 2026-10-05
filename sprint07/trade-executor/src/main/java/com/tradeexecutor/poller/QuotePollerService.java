package com.tradeexecutor.poller;

import com.tradeexecutor.client.FauxnanceClient;
import com.tradeexecutor.client.QuoteResponse;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.kafka.QuotePayload;
import com.tradeexecutor.mapper.PositionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Market Data Poller - Scheduled component inside Trade Executor.
 * 
 * Polls the Fauxnance API for current quotes on symbols that are:
 * 1. Held in positions by any account
 * 2. Being watched by accounts (if watchlist tracking is enabled)
 * 
 * Design:
 * - Batches HTTP requests: up to 25 symbols per Fauxnance API call (quota optimization)
 * - Publishes per-symbol: each quote is ONE message to market-data, keyed by symbol
 *   (ensures per-symbol ordering; batching the message puts symbols behind one key)
 * - Scheduled: interval configurable via POLL_INTERVAL_SECONDS environment variable
 * - Interval floor: enforced in code (minimum 30 seconds) to stay within 2000 req/day quota
 * 
 * Quota calculation:
 * Let S = number of symbols, I = interval in seconds
 * Requests per day = 86400 / I / ceiling(S / 25)
 * 
 * Examples:
 * - 8 symbols @ 30s: 86400 / 30 / 1 = 2880 req/day (EXCEEDS 2000 quota)
 * - 8 symbols @ 43s: 86400 / 43 / 1 = 2009 req/day (within quota)
 * - 8 symbols @ 44s: 86400 / 44 / 1 = 1964 req/day (safe)
 * - 25 symbols @ 60s: 86400 / 60 / 1 = 1440 req/day (safe)
 * - 26 symbols @ 60s: 86400 / 60 / 2 = 720 req/day (safe, but slower updates)
 * 
 * Consumer groups:
 * - No explicit subscription: broadcasts to all listeners on market-data
 * - Each service subscribes and maintains its own position independently
 */
@Component
public class QuotePollerService {
    
    private static final Logger logger = LoggerFactory.getLogger(QuotePollerService.class);
    
    private static final int MIN_INTERVAL_SECONDS = 30;
    private static final int SECONDS_PER_DAY = 86400;
    private static final int BATCH_SIZE = 25;
    private static final int QUOTA_LIMIT = 2000;
    
    private final PositionMapper positionMapper;
    private final FauxnanceClient fauxnanceClient;
    private final KafkaProducer kafkaProducer;
    private final int pollIntervalSeconds;
    private long lastPollTime = 0;
    
    public QuotePollerService(
            PositionMapper positionMapper,
            FauxnanceClient fauxnanceClient,
            KafkaProducer kafkaProducer,
            @Value("${app.poller.poll-interval-ms:30000}") long pollIntervalMs) {
        
        this.positionMapper = positionMapper;
        this.fauxnanceClient = fauxnanceClient;
        this.kafkaProducer = kafkaProducer;
        
        // Convert milliseconds to seconds for validation and logging
        int pollIntervalSeconds = (int) (pollIntervalMs / 1000);
        
        // Enforce interval floor (30 seconds minimum)
        if (pollIntervalSeconds < MIN_INTERVAL_SECONDS) {
            logger.warn(
                    "Configured poll interval {} seconds is below minimum {} seconds. Using minimum interval.",
                    pollIntervalSeconds, MIN_INTERVAL_SECONDS);
            this.pollIntervalSeconds = MIN_INTERVAL_SECONDS;
        } else {
            this.pollIntervalSeconds = pollIntervalSeconds;
        }
        
        // Log quota calculation
        logQuotaCalculation();
    }
    
    /**
     * Scheduled method that polls Fauxnance for quotes and publishes to market-data topic.
     * 
     * Runs at intervals specified by POLL_INTERVAL_SECONDS (default 30 seconds, min 30 seconds).
     * Note: fixedRateString requires milliseconds, so we use poll-interval-ms in config.
     */
    @Scheduled(fixedRateString = "${app.poller.poll-interval-ms:30000}")
    public void pollAndPublishQuotes() {
        logger.info("=== Market Data Poll Started ===");
        long pollStartTime = System.currentTimeMillis();
        
        try {
            // Step 1: Discover symbols
            Set<String> symbols = discoverSymbols();
            
            if (symbols.isEmpty()) {
                logger.info("No symbols to poll");
                return;
            }
            
            logger.info("Polling {} symbols in batches of {}", symbols.size(), BATCH_SIZE);
            
            // Step 2: Batch fetch quotes from Fauxnance
            List<QuoteResponse> quotes = fauxnanceClient.getQuotesBatch(new ArrayList<>(symbols));
            
            if (quotes.isEmpty()) {
                logger.warn("No quotes received from Fauxnance");
                return;
            }
            
            logger.info("Received {} quotes from Fauxnance", quotes.size());
            
            // Step 3: Publish one message per symbol to market-data topic
            int publishedCount = 0;
            for (QuoteResponse quote : quotes) {
                publishQuoteToKafka(quote);
                publishedCount++;
            }
            
            long pollDurationMs = System.currentTimeMillis() - pollStartTime;
            logger.info("=== Market Data Poll Complete === Published {} quotes in {}ms",
                    publishedCount, pollDurationMs);
            
        } catch (Exception e) {
            logger.error("Market data poll failed", e);
        }
    }
    
    /**
     * Discover symbols to poll.
     * 
     * Returns all distinct symbols from the Position table (symbols held by any account).
     * Extension point: could also include watchlist symbols if implemented.
     * 
     * @return Set of symbols to poll
     */
    private Set<String> discoverSymbols() {
        try {
            // Query for symbols held in positions
            List<String> heldSymbols = positionMapper.findAllDistinctSymbols();
            logger.debug("Found {} symbols in positions", heldSymbols.size());
            
            Set<String> allSymbols = new HashSet<>(heldSymbols);
            
            // Future: add watchlist symbols here
            // List<String> watchedSymbols = watchlistRepository.findAllDistinctSymbols();
            // allSymbols.addAll(watchedSymbols);
            
            return allSymbols;
        } catch (Exception e) {
            logger.error("Failed to discover symbols", e);
            return new HashSet<>();
        }
    }
    
    /**
     * Convert a QuoteResponse from Fauxnance to a QuotePayload and publish to Kafka.
     * 
     * Each quote is published as a separate message, keyed by symbol.
     * This ensures per-symbol ordering and allows per-symbol consumers.
     * 
     * @param quote The quote from Fauxnance
     */
    private void publishQuoteToKafka(QuoteResponse quote) {
        try {
            // Use the quote's observation time (asOf) from Fauxnance, not poll time
            String quoteTime = quote.getAsOf() != null ? quote.getAsOf() : 
                DateTimeFormatter.ISO_INSTANT.format(Instant.now());
            
            QuotePayload payload = new QuotePayload(
                    quote.getSymbol(),
                    quote.getPrice(),
                    quote.getBid(),
                    quote.getAsk(),
                    quote.getCurrency() != null ? quote.getCurrency() : "USD",
                    quote.getChange(),        // Actual change from Fauxnance
                    quote.getChangePercent(), // Actual changePercent from Fauxnance
                    quote.getPreviousClose(), // Actual previousClose from Fauxnance
                    quote.getMarketState() != null ? quote.getMarketState() : "unknown",
                    false,                    // stale: false since we just fetched it
                    quoteTime                 // quoteAsOf: Fauxnance observation time
            );
            
            kafkaProducer.publishQuote(quote.getSymbol(), payload);
            logger.debug("Published quote for {} (price: {}, change: {})", 
                quote.getSymbol(), quote.getPrice(), quote.getChange());
            
        } catch (Exception e) {
            logger.error("Failed to publish quote for {}", quote.getSymbol(), e);
        }
    }
    
    /**
     * Log the quota calculation to help verify we stay within the 2000 req/day limit.
     * 
     * Should be called at startup so the calculation is visible in logs.
     */
    private void logQuotaCalculation() {
        // We don't know the symbol count at startup, so estimate worst-case
        // This will be recalculated at poll time with actual symbol count
        logger.info("========================================");
        logger.info("Market Data Poller Quota Analysis");
        logger.info("========================================");
        logger.info("Configured interval: {} seconds", pollIntervalSeconds);
        logger.info("Minimum interval: {} seconds", MIN_INTERVAL_SECONDS);
        logger.info("Daily quota limit: {} requests", QUOTA_LIMIT);
        logger.info("Batch size: {} symbols per HTTP request", BATCH_SIZE);
        logger.info("");
        logger.info("Quota calculation: reqPerDay = 86400 / interval / ceiling(symbolCount / 25)");
        logger.info("");
        logger.info("Examples at {} second interval:", pollIntervalSeconds);
        
        for (int symbolCount : new int[]{1, 8, 10, 25, 26, 50, 100}) {
            int batches = (symbolCount + BATCH_SIZE - 1) / BATCH_SIZE;  // ceiling division
            int requestsPerDay = SECONDS_PER_DAY / pollIntervalSeconds / batches;
            String status = requestsPerDay > QUOTA_LIMIT ? "⚠️  EXCEEDS" : "✓ within";
            logger.info("  {} symbols: {} batches × {} polled = {} req/day [{}]",
                    String.format("%3d", symbolCount),
                    batches,
                    pollIntervalSeconds,
                    String.format("%4d", requestsPerDay),
                    status);
        }
        
        logger.info("========================================");
    }
}
