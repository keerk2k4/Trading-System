package com.tradeexecutor.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClientException;

import java.util.Optional;

/**
 * HTTP client for Fauxnance API.
 * 
 * Fetches live market quotes from the Fauxnance service with configurable retry logic.
 * 
 * Features:
 * - Retry on transient failures
 * - Configurable retry budget (max attempts, delay between retries)
 * - Return Optional.empty() after retry budget exhausted
 */
@Component
public class FauxnanceClient {
    
    private static final Logger logger = LoggerFactory.getLogger(FauxnanceClient.class);
    
    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String apiKey;
    private final int maxRetryAttempts;
    private final long retryDelayMs;
    
    public FauxnanceClient(
            RestTemplate restTemplate,
            @Value("${app.fauxnance.base-url:http://localhost:8080}") String baseUrl,
            @Value("${app.fauxnance.api-key:}") String apiKey,
            @Value("${app.fauxnance.retry.max-attempts:3}") int maxRetryAttempts,
            @Value("${app.fauxnance.retry.delay-ms:100}") long retryDelayMs) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.maxRetryAttempts = maxRetryAttempts;
        this.retryDelayMs = retryDelayMs;
    }
    
    /**
     * Fetch a quote for a single symbol from Fauxnance.
     * 
     * Implements retry logic with exponential backoff:
     * - Attempts up to maxRetryAttempts times
     * - Waits retryDelayMs between attempts
     * - Returns Optional.empty() if all attempts fail
     * 
     * @param symbol The stock symbol (e.g., "AAPL")
     * @return Optional containing the quote if successful, Optional.empty() if all retries failed
     */
    public Optional<QuoteResponse> getQuote(String symbol) {
        if (symbol == null || symbol.trim().isEmpty()) {
            logger.error("Symbol cannot be null or empty");
            return Optional.empty();
        }
        
        String url = buildQuoteUrl(symbol);
        
        for (int attempt = 1; attempt <= maxRetryAttempts; attempt++) {
            try {
                logger.debug("Fetching quote for {} (attempt {}/{})", symbol, attempt, maxRetryAttempts);
                QuoteResponse quote = restTemplate.getForObject(url, QuoteResponse.class);
                logger.info("Successfully fetched quote for {}: {}", symbol, quote);
                return Optional.of(quote);
            } catch (RestClientException e) {
                logger.warn("Attempt {} failed to fetch quote for {}: {}", attempt, symbol, e.getMessage());
                
                if (attempt < maxRetryAttempts) {
                    try {
                        Thread.sleep(retryDelayMs);
                    } catch (InterruptedException ie) {
                        logger.warn("Retry sleep interrupted for symbol {}", symbol);
                        Thread.currentThread().interrupt();
                        break;
                    }
                } else {
                    logger.error("Failed to fetch quote for {} after {} attempts", symbol, maxRetryAttempts);
                }
            }
        }
        
        return Optional.empty();
    }
    
    private String buildQuoteUrl(String symbol) {
        StringBuilder url = new StringBuilder(baseUrl);
        if (!baseUrl.endsWith("/")) {
            url.append("/");
        }
        url.append("quotes/").append(symbol);
        if (apiKey != null && !apiKey.isEmpty()) {
            url.append("?key=").append(apiKey);
        }
        return url.toString();
    }
}

