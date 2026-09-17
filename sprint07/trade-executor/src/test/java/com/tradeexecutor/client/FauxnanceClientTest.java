package com.tradeexecutor.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for FauxnanceClient.
 * 
 * Tests the retry logic and quote fetching behavior.
 */
@DisplayName("FauxnanceClient Tests")
@ExtendWith(MockitoExtension.class)
class FauxnanceClientTest {
    
    @Mock
    private RestTemplate restTemplate;
    
    private FauxnanceClient fauxnanceClient;
    private static final String BASE_URL = "http://localhost:8080";
    private static final String API_KEY = "test-key";
    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 100;
    
    @BeforeEach
    void setUp() {
        fauxnanceClient = new FauxnanceClient(
            restTemplate,
            BASE_URL,
            API_KEY,
            MAX_RETRIES,
            RETRY_DELAY_MS
        );
    }
    
    /**
     * Test Case 1: Successful quote retrieval on first attempt
     */
    @Test
    @DisplayName("Successful quote retrieval on first attempt")
    void testGetQuoteSuccessFirstAttempt() {
        // Given: A valid symbol and successful response from Fauxnance
        String symbol = "AAPL";
        QuoteResponse expectedQuote = new QuoteResponse(
            "AAPL",
            new BigDecimal("150.00"),
            new BigDecimal("149.99"),
            new BigDecimal("150.01"),
            System.currentTimeMillis()
        );
        
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse.class)))
            .thenReturn(expectedQuote);
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Quote should be returned
        assertTrue(result.isPresent());
        assertEquals(expectedQuote, result.get());
        assertEquals("AAPL", result.get().getSymbol());
        assertEquals(new BigDecimal("150.00"), result.get().getPrice());
        
        // Verify it only tried once
        verify(restTemplate, times(1)).getForObject(anyString(), eq(QuoteResponse.class));
    }
    
    /**
     * Test Case 4: Fauxnance unavailable after retry budget exhausted -> pricing-unavailable
     */
    @Test
    @DisplayName("Fauxnance unavailable after retry budget exhausted")
    void testGetQuoteFailsAfterRetries() {
        // Given: All retry attempts fail
        String symbol = "AAPL";
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse.class)))
            .thenThrow(new RestClientException("Connection refused"));
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Empty optional returned (pricing unavailable)
        assertFalse(result.isPresent());
        
        // Verify it retried MAX_RETRIES times
        verify(restTemplate, times(MAX_RETRIES)).getForObject(anyString(), eq(QuoteResponse.class));
    }
    
    @Test
    @DisplayName("Retry on first attempt failure, succeed on second")
    void testGetQuoteSucceedsAfterRetry() {
        // Given: First attempt fails, second succeeds
        String symbol = "AAPL";
        QuoteResponse expectedQuote = new QuoteResponse(
            "AAPL",
            new BigDecimal("150.00"),
            new BigDecimal("149.99"),
            new BigDecimal("150.01"),
            System.currentTimeMillis()
        );
        
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse.class)))
            .thenThrow(new RestClientException("Temporary failure"))
            .thenReturn(expectedQuote);
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Quote should be returned on second attempt
        assertTrue(result.isPresent());
        assertEquals(expectedQuote, result.get());
        
        // Verify it retried and succeeded
        verify(restTemplate, times(2)).getForObject(anyString(), eq(QuoteResponse.class));
    }
    
    @Test
    @DisplayName("Null symbol returns empty")
    void testGetQuoteWithNullSymbol() {
        // Given: Null symbol
        String symbol = null;
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Empty optional returned
        assertFalse(result.isPresent());
        
        // Verify no HTTP call was made
        verify(restTemplate, never()).getForObject(anyString(), eq(QuoteResponse.class));
    }
    
    @Test
    @DisplayName("Empty symbol returns empty")
    void testGetQuoteWithEmptySymbol() {
        // Given: Empty symbol
        String symbol = "";
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Empty optional returned
        assertFalse(result.isPresent());
        
        // Verify no HTTP call was made
        verify(restTemplate, never()).getForObject(anyString(), eq(QuoteResponse.class));
    }
    
    @Test
    @DisplayName("Whitespace-only symbol returns empty")
    void testGetQuoteWithWhitespaceSymbol() {
        // Given: Whitespace symbol
        String symbol = "   ";
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Empty optional returned
        assertFalse(result.isPresent());
        
        // Verify no HTTP call was made
        verify(restTemplate, never()).getForObject(anyString(), eq(QuoteResponse.class));
    }
    
    @Test
    @DisplayName("URL is correctly constructed with base URL and symbol")
    void testUrlConstruction() {
        // Given: A symbol and base URL
        String symbol = "MSFT";
        QuoteResponse expectedQuote = new QuoteResponse(
            "MSFT",
            new BigDecimal("300.00"),
            new BigDecimal("299.99"),
            new BigDecimal("300.01"),
            System.currentTimeMillis()
        );
        
        when(restTemplate.getForObject(
            "http://localhost:8080/quotes/MSFT?key=test-key",
            QuoteResponse.class
        )).thenReturn(expectedQuote);
        
        // When: Fetch quote
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        // Then: Correct URL should have been called
        assertTrue(result.isPresent());
        verify(restTemplate, times(1)).getForObject(
            "http://localhost:8080/quotes/MSFT?key=test-key",
            QuoteResponse.class
        );
    }
    
    @Test
    @DisplayName("URL construction with base URL ending with slash")
    void testUrlConstructionWithTrailingSlash() {
        // Given: A FauxnanceClient with base URL ending with slash
        FauxnanceClient clientWithSlash = new FauxnanceClient(
            restTemplate,
            "http://localhost:8080/",
            API_KEY,
            MAX_RETRIES,
            RETRY_DELAY_MS
        );
        QuoteResponse expectedQuote = new QuoteResponse(
            "GOOG",
            new BigDecimal("2500.00"),
            new BigDecimal("2499.99"),
            new BigDecimal("2500.01"),
            System.currentTimeMillis()
        );
        
        when(restTemplate.getForObject(
            "http://localhost:8080/quotes/GOOG?key=test-key",
            QuoteResponse.class
        )).thenReturn(expectedQuote);
        
        // When: Fetch quote
        Optional<QuoteResponse> result = clientWithSlash.getQuote("GOOG");
        
        // Then: Correct URL should have been called (no double slash)
        assertTrue(result.isPresent());
        verify(restTemplate, times(1)).getForObject(
            "http://localhost:8080/quotes/GOOG?key=test-key",
            QuoteResponse.class
        );
    }
    
    // ===== BATCH FETCH TESTS (Acceptance Criteria #1) =====
    
    @Test
    @DisplayName("Batch fetch up to 25 symbols in one request")
    void testBatchFetchUpTo25Symbols() {
        // Given: 8 symbols to fetch
        List<String> symbols = Arrays.asList("AAPL", "GOOG", "MSFT", "AMZN", "NVDA", "TSLA", "META", "NFLX");
        
        QuoteResponse[] responses = new QuoteResponse[8];
        for (int i = 0; i < symbols.size(); i++) {
            responses[i] = new QuoteResponse(
                symbols.get(i),
                new BigDecimal("100.00"),
                new BigDecimal("99.50"),
                new BigDecimal("100.50"),
                System.currentTimeMillis()
            );
        }
        
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse[].class)))
            .thenReturn(responses);
        
        // When: Fetch batch
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        // Then: All quotes returned in one batch
        assertEquals(8, result.size());
        verify(restTemplate, times(1)).getForObject(anyString(), eq(QuoteResponse[].class));
        
        // Verify all symbols present
        for (String symbol : symbols) {
            assertTrue(result.stream().anyMatch(q -> q.getSymbol().equals(symbol)),
                "Symbol " + symbol + " should be in results");
        }
    }
    
    @Test
    @DisplayName("Batch fetch 26 symbols (requires 2 batches: 25 + 1)")
    void testBatchFetch26SymbolsMultipleBatches() {
        // Given: 26 symbols (exceeds batch size of 25)
        List<String> symbols = new ArrayList<>();
        for (int i = 0; i < 26; i++) {
            symbols.add("SYM" + String.format("%02d", i));
        }
        
        QuoteResponse[] firstBatch = new QuoteResponse[25];
        for (int i = 0; i < 25; i++) {
            firstBatch[i] = new QuoteResponse(symbols.get(i), BigDecimal.TEN, new BigDecimal("9.50"), new BigDecimal("10.50"), System.currentTimeMillis());
        }
        
        QuoteResponse[] secondBatch = new QuoteResponse[1];
        secondBatch[0] = new QuoteResponse(symbols.get(25), BigDecimal.TEN, new BigDecimal("9.50"), new BigDecimal("10.50"), System.currentTimeMillis());
        
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse[].class)))
            .thenReturn(firstBatch)
            .thenReturn(secondBatch);
        
        // When: Fetch batch
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        // Then: All 26 quotes returned in 2 HTTP calls
        assertEquals(26, result.size());
        verify(restTemplate, times(2)).getForObject(anyString(), eq(QuoteResponse[].class));
    }
    
    @Test
    @DisplayName("Batch fetch with retry on transient failure")
    void testBatchFetchWithRetry() {
        // Given: API fails once then succeeds
        List<String> symbols = Arrays.asList("AAPL", "GOOG");
        
        QuoteResponse[] responses = new QuoteResponse[2];
        responses[0] = new QuoteResponse("AAPL", BigDecimal.TEN, new BigDecimal("9.50"), new BigDecimal("10.50"), System.currentTimeMillis());
        responses[1] = new QuoteResponse("GOOG", BigDecimal.TEN, new BigDecimal("9.50"), new BigDecimal("10.50"), System.currentTimeMillis());
        
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse[].class)))
            .thenThrow(new RestClientException("Connection timeout"))
            .thenReturn(responses);
        
        // When: Fetch batch
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        // Then: Retried and succeeded
        assertEquals(2, result.size());
        verify(restTemplate, times(2)).getForObject(anyString(), eq(QuoteResponse[].class));
    }
    
    @Test
    @DisplayName("Batch fetch fails after max retries")
    void testBatchFetchMaxRetriesExceeded() {
        // Given: API always fails
        List<String> symbols = Arrays.asList("AAPL");
        
        when(restTemplate.getForObject(anyString(), eq(QuoteResponse[].class)))
            .thenThrow(new RestClientException("Connection lost"));
        
        // When: Fetch batch
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        // Then: Returns empty after max retries
        assertEquals(0, result.size());
        verify(restTemplate, times(MAX_RETRIES)).getForObject(anyString(), eq(QuoteResponse[].class));
    }
    
    @Test
    @DisplayName("Batch fetch with empty symbol list")
    void testBatchFetchEmptySymbolList() {
        // When: Fetch batch with empty list
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(new ArrayList<>());
        
        // Then: Returns empty, no HTTP call made
        assertEquals(0, result.size());
        verify(restTemplate, never()).getForObject(anyString(), eq(QuoteResponse[].class));
    }
    
    @Test
    @DisplayName("Batch fetch with null symbol list")
    void testBatchFetchNullSymbolList() {
        // When: Fetch batch with null list
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(null);
        
        // Then: Returns empty, no HTTP call made
        assertEquals(0, result.size());
        verify(restTemplate, never()).getForObject(anyString(), eq(QuoteResponse[].class));
    }
}

