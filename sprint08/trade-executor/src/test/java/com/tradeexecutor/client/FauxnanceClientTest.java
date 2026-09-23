package com.tradeexecutor.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
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
    private static final long RETRY_DELAY_MS = 10;  // Short delay for fast tests
    
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
        String symbol = "AAPL";
        QuoteResponse expectedQuote = new QuoteResponse(
            "AAPL",
            new BigDecimal("150.00"),
            new BigDecimal("149.99"),
            new BigDecimal("150.01"),
            System.currentTimeMillis()
        );
        
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper();
        wrapper.setData(expectedQuote);
        ResponseEntity<QuoteResponseWrapper> resp = new ResponseEntity<>(wrapper, HttpStatus.OK);
        
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenReturn(resp);
        
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        assertTrue(result.isPresent());
        assertEquals("AAPL", result.get().getSymbol());
        
        verify(restTemplate, times(1)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Fauxnance unavailable after retry budget exhausted")
    void testGetQuoteFailsAfterRetries() {
        String symbol = "AAPL";
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenThrow(new RestClientException("Connection refused"));
        
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        assertFalse(result.isPresent());
        
        verify(restTemplate, times(MAX_RETRIES)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Retry on first attempt failure, succeed on second")
    void testGetQuoteSucceedsAfterRetry() {
        String symbol = "AAPL";
        QuoteResponse expectedQuote = new QuoteResponse(
            "AAPL",
            new BigDecimal("150.00"),
            new BigDecimal("149.99"),
            new BigDecimal("150.01"),
            System.currentTimeMillis()
        );
        
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper();
        wrapper.setData(expectedQuote);
        ResponseEntity<QuoteResponseWrapper> resp = new ResponseEntity<>(wrapper, HttpStatus.OK);
        
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenThrow(new RestClientException("Temporary failure"))
            .thenReturn(resp);
        
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        assertTrue(result.isPresent());
        
        verify(restTemplate, times(2)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Null symbol returns empty")
    void testGetQuoteWithNullSymbol() {
        String symbol = null;
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        assertFalse(result.isPresent());
        verify(restTemplate, never()).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Empty symbol returns empty")
    void testGetQuoteWithEmptySymbol() {
        String symbol = "";
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        assertFalse(result.isPresent());
        verify(restTemplate, never()).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Whitespace-only symbol returns empty")
    void testGetQuoteWithWhitespaceSymbol() {
        String symbol = "   ";
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        
        assertFalse(result.isPresent());
        verify(restTemplate, never()).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("URL is correctly constructed with base URL and symbol")
    void testUrlConstruction() {
        String symbol = "MSFT";
        QuoteResponse expectedQuote = new QuoteResponse(
            "MSFT",
            new BigDecimal("300.00"),
            new BigDecimal("299.99"),
            new BigDecimal("300.01"),
            System.currentTimeMillis()
        );
        
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper();
        wrapper.setData(expectedQuote);
        ResponseEntity<QuoteResponseWrapper> resp = new ResponseEntity<>(wrapper, HttpStatus.OK);
        
        when(restTemplate.exchange(contains("MSFT"), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenReturn(resp);
        
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(symbol);
        assertTrue(result.isPresent());
        verify(restTemplate, times(1)).exchange(contains("MSFT"), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("URL construction with base URL ending with slash")
    void testUrlConstructionWithTrailingSlash() {
        FauxnanceClient clientWithSlash = new FauxnanceClient(restTemplate, "http://localhost:8080/", API_KEY, MAX_RETRIES, RETRY_DELAY_MS);
        QuoteResponse expectedQuote = new QuoteResponse(
            "GOOG",
            new BigDecimal("2500.00"),
            new BigDecimal("2499.99"),
            new BigDecimal("2500.01"),
            System.currentTimeMillis()
        );
        
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper();
        wrapper.setData(expectedQuote);
        ResponseEntity<QuoteResponseWrapper> resp = new ResponseEntity<>(wrapper, HttpStatus.OK);
        
        when(restTemplate.exchange(contains("GOOG"), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenReturn(resp);
        
        Optional<QuoteResponse> result = clientWithSlash.getQuote("GOOG");
        assertTrue(result.isPresent());
        verify(restTemplate, times(1)).exchange(contains("GOOG"), eq(HttpMethod.GET), any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Batch fetch up to 25 symbols in one request")
    void testBatchFetchUpTo25Symbols() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG", "MSFT", "AMZN", "NVDA", "TSLA", "META", "NFLX");
        
        BatchQuotesResponseWrapper wrapper = new BatchQuotesResponseWrapper();
        BatchQuotesData data = new BatchQuotesData();
        List<BatchQuoteItem> items = new ArrayList<>();
        
        for (String sym : symbols) {
            BatchQuoteItem item = new BatchQuoteItem();
            item.setSymbol(sym);
            item.setQuote(new QuoteResponse(sym, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, System.currentTimeMillis()));
            items.add(item);
        }
        data.setQuotes(items);
        wrapper.setData(data);
        
        ResponseEntity<BatchQuotesResponseWrapper> resp = new ResponseEntity<>(wrapper, HttpStatus.OK);
        
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class)))
            .thenReturn(resp);
        
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        assertEquals(8, result.size());
        verify(restTemplate, times(1)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class));
        
        for (String symbol : symbols) {
            assertTrue(result.stream().anyMatch(q -> q.getSymbol().equals(symbol)));
        }
    }
    
    @Test
    @DisplayName("Batch fetch 26 symbols (requires 2 batches: 25 + 1)")
    void testBatchFetch26SymbolsMultipleBatches() {
        List<String> symbols = new ArrayList<>();
        for (int i = 0; i < 26; i++) {
            symbols.add("SYM" + String.format("%02d", i));
        }
        
        BatchQuotesResponseWrapper wrapper1 = createBatchWrapper(symbols.subList(0, 25));
        BatchQuotesResponseWrapper wrapper2 = createBatchWrapper(symbols.subList(25, 26));
        ResponseEntity<BatchQuotesResponseWrapper> resp1 = new ResponseEntity<>(wrapper1, HttpStatus.OK);
        ResponseEntity<BatchQuotesResponseWrapper> resp2 = new ResponseEntity<>(wrapper2, HttpStatus.OK);
        
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class)))
            .thenReturn(resp1)
            .thenReturn(resp2);
        
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        assertEquals(26, result.size());
        verify(restTemplate, times(2)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Batch fetch with retry on transient failure")
    void testBatchFetchWithRetry() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG");
        
        BatchQuotesResponseWrapper wrapper = createBatchWrapper(symbols);
        ResponseEntity<BatchQuotesResponseWrapper> resp = new ResponseEntity<>(wrapper, HttpStatus.OK);
        
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class)))
            .thenThrow(new RestClientException("Connection timeout"))
            .thenReturn(resp);
        
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        assertEquals(2, result.size());
        verify(restTemplate, times(2)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Batch fetch fails after max retries")
    void testBatchFetchMaxRetriesExceeded() {
        List<String> symbols = Arrays.asList("AAPL");
        
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class)))
            .thenThrow(new RestClientException("Connection lost"));
        
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);
        
        assertEquals(0, result.size());
        verify(restTemplate, times(MAX_RETRIES)).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Batch fetch with empty symbol list")
    void testBatchFetchEmptySymbolList() {
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(new ArrayList<>());
        
        assertEquals(0, result.size());
        verify(restTemplate, never()).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class));
    }
    
    @Test
    @DisplayName("Batch fetch with null symbol list")
    void testBatchFetchNullSymbolList() {
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(null);
        
        assertEquals(0, result.size());
        verify(restTemplate, never()).exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(BatchQuotesResponseWrapper.class));
    }
    
    private BatchQuotesResponseWrapper createBatchWrapper(List<String> symbols) {
        BatchQuotesResponseWrapper wrapper = new BatchQuotesResponseWrapper();
        BatchQuotesData data = new BatchQuotesData();
        List<BatchQuoteItem> items = new ArrayList<>();
        
        for (String sym : symbols) {
            BatchQuoteItem item = new BatchQuoteItem();
            item.setSymbol(sym);
            item.setQuote(new QuoteResponse(sym, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, System.currentTimeMillis()));
            items.add(item);
        }
        data.setQuotes(items);
        wrapper.setData(data);
        return wrapper;
    }
}

