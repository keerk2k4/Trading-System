package com.tradeexecutor.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

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
    
    public List<QuoteResponse> getQuotesBatch(List<String> symbols) {
        if (symbols == null || symbols.isEmpty()) {
            logger.warn("No symbols provided for batch quote fetch");
            return new ArrayList<>();
        }
        
        // Batch into chunks of up to 25 symbols
        List<QuoteResponse> allQuotes = new ArrayList<>();
        int batchSize = 25;
        
        for (int i = 0; i < symbols.size(); i += batchSize) {
            int end = Math.min(i + batchSize, symbols.size());
            List<String> batch = symbols.subList(i, end);
            
            logger.debug("Fetching batch of {} symbols (symbols {}-{})", batch.size(), i + 1, end);
            
            String batchUrl = buildBatchQuoteUrl(batch);
            
            for (int attempt = 1; attempt <= maxRetryAttempts; attempt++) {
                try {
                    logger.debug("Fetching batch (attempt {}/{})", attempt, maxRetryAttempts);
                    HttpHeaders headers = createHeaders();
                    HttpEntity<String> entity = new HttpEntity<>(headers);
                    ResponseEntity<BatchQuotesResponseWrapper> response = restTemplate.exchange(batchUrl, HttpMethod.GET, entity, BatchQuotesResponseWrapper.class);
                    BatchQuotesResponseWrapper wrapper = response.getBody();
                    
                    if (wrapper != null && wrapper.getData() != null && wrapper.getData().getQuotes() != null) {
                        for (BatchQuoteItem item : wrapper.getData().getQuotes()) {
                            if (item != null && !item.hasError() && item.getQuote() != null) {
                                QuoteResponse quote = item.getQuote();
                                allQuotes.add(quote);
                                logger.debug("Added quote for {}: {}", quote.getSymbol(), quote.getPrice());
                            } else if (item != null && item.hasError()) {
                                logger.warn("Error fetching quote for {}: {}", item.getSymbol(), item.getError());
                            }
                        }
                        logger.info("Successfully fetched {} quotes from batch", wrapper.getData().getQuotes().size());
                        break;  // Success, move to next batch
                    }
                } catch (RestClientException e) {
                    logger.warn("Attempt {} failed to fetch batch: {}", attempt, e.getMessage());
                    
                    if (attempt < maxRetryAttempts) {
                        try {
                            Thread.sleep(retryDelayMs);
                        } catch (InterruptedException ie) {
                            logger.warn("Retry sleep interrupted during batch fetch");
                            Thread.currentThread().interrupt();
                            break;
                        }
                    } else {
                        logger.error("Failed to fetch batch after {} attempts", maxRetryAttempts);
                    }
                }
            }
        }
        
        logger.info("Batch fetch complete: {} total quotes", allQuotes.size());
        return allQuotes;
    }
    
    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        if (apiKey != null && !apiKey.isEmpty()) {
            headers.set("X-Api-Key", apiKey);
        }
        return headers;
    }

    public Optional<QuoteResponse> getQuote(String symbol) {
        if (symbol == null || symbol.trim().isEmpty()) {
            logger.error("Symbol cannot be null or empty");
            return Optional.empty();
        }
        
        String url = buildQuoteUrl(symbol);
        
        for (int attempt = 1; attempt <= maxRetryAttempts; attempt++) {
            try {
                logger.debug("Fetching quote for {} (attempt {}/{})", symbol, attempt, maxRetryAttempts);
                HttpHeaders headers = createHeaders();
                HttpEntity<String> entity = new HttpEntity<>(headers);
                ResponseEntity<QuoteResponseWrapper> response = restTemplate.exchange(url, HttpMethod.GET, entity, QuoteResponseWrapper.class);
                QuoteResponseWrapper wrapper = response.getBody();
                if (wrapper != null && wrapper.getData() != null) {
                    QuoteResponse quote = wrapper.getData();
                    logger.info("Successfully fetched quote for {}: {}", symbol, quote);
                    return Optional.of(quote);
                }
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
    
    private String buildBatchQuoteUrl(List<String> symbols) {
        StringBuilder url = new StringBuilder(baseUrl);
        if (!baseUrl.endsWith("/")) {
            url.append("/");
        }
        
        // Use /quotes endpoint with symbols parameter for batch fetch
        url.append("quotes?symbols=");
        for (int i = 0; i < symbols.size(); i++) {
            if (i > 0) {
                url.append(",");
            }
            url.append(symbols.get(i));
        }
        
        return url.toString();
    }
    
    private String buildQuoteUrl(String symbol) {
        StringBuilder url = new StringBuilder(baseUrl);
        if (!baseUrl.endsWith("/")) {
            url.append("/");
        }
        url.append("quotes/").append(symbol);
        return url.toString();
    }
}

