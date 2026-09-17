package com.tradeexecutor.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for FauxnanceClient.
 *
 * The client uses RestTemplate.exchange with wrapper envelopes
 * (QuoteResponseWrapper / BatchQuotesResponseWrapper), so tests mock
 * exchange rather than getForObject.
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
    private static final long RETRY_DELAY_MS = 10;

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

    // ========== Single-quote tests ==========

    @Test
    @DisplayName("Successful quote retrieval on first attempt")
    void testGetQuoteSuccessFirstAttempt() {
        QuoteResponse expectedQuote = quote("AAPL", "150.00");
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper(expectedQuote, null);

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(QuoteResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        Optional<QuoteResponse> result = fauxnanceClient.getQuote("AAPL");

        assertTrue(result.isPresent());
        assertEquals(expectedQuote, result.get());
        assertEquals("AAPL", result.get().getSymbol());
        assertEquals(new BigDecimal("150.00"), result.get().getPrice());

        verify(restTemplate, times(1)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(QuoteResponseWrapper.class));
    }

    @Test
    @DisplayName("Fauxnance unavailable after retry budget exhausted")
    void testGetQuoteFailsAfterRetries() {
        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(QuoteResponseWrapper.class)))
            .thenThrow(new RestClientException("Connection refused"));

        Optional<QuoteResponse> result = fauxnanceClient.getQuote("AAPL");

        assertFalse(result.isPresent());
        verify(restTemplate, times(MAX_RETRIES)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(QuoteResponseWrapper.class));
    }

    @Test
    @DisplayName("Retry on first attempt failure, succeed on second")
    void testGetQuoteSucceedsAfterRetry() {
        QuoteResponse expectedQuote = quote("AAPL", "150.00");
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper(expectedQuote, null);

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(QuoteResponseWrapper.class)))
            .thenThrow(new RestClientException("Temporary failure"))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        Optional<QuoteResponse> result = fauxnanceClient.getQuote("AAPL");

        assertTrue(result.isPresent());
        assertEquals(expectedQuote, result.get());
        verify(restTemplate, times(2)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(QuoteResponseWrapper.class));
    }

    @Test
    @DisplayName("Null body wrapper returns empty")
    void testGetQuoteNullBodyReturnsEmpty() {
        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(QuoteResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(new QuoteResponseWrapper(null, null), HttpStatus.OK));

        Optional<QuoteResponse> result = fauxnanceClient.getQuote("AAPL");

        assertFalse(result.isPresent());
    }

    @Test
    @DisplayName("Null symbol returns empty")
    void testGetQuoteWithNullSymbol() {
        Optional<QuoteResponse> result = fauxnanceClient.getQuote(null);

        assertFalse(result.isPresent());
        verify(restTemplate, never()).exchange(
            anyString(), any(), any(), any(Class.class));
    }

    @Test
    @DisplayName("Empty symbol returns empty")
    void testGetQuoteWithEmptySymbol() {
        Optional<QuoteResponse> result = fauxnanceClient.getQuote("");

        assertFalse(result.isPresent());
        verify(restTemplate, never()).exchange(
            anyString(), any(), any(), any(Class.class));
    }

    @Test
    @DisplayName("Whitespace-only symbol returns empty")
    void testGetQuoteWithWhitespaceSymbol() {
        Optional<QuoteResponse> result = fauxnanceClient.getQuote("   ");

        assertFalse(result.isPresent());
        verify(restTemplate, never()).exchange(
            anyString(), any(), any(), any(Class.class));
    }

    @Test
    @DisplayName("Single quote URL uses /quotes/{symbol} path")
    void testUrlConstruction() {
        QuoteResponse expectedQuote = quote("MSFT", "300.00");
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper(expectedQuote, null);

        when(restTemplate.exchange(
                eq("http://localhost:8080/quotes/MSFT"), eq(HttpMethod.GET),
                any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        Optional<QuoteResponse> result = fauxnanceClient.getQuote("MSFT");

        assertTrue(result.isPresent());
        verify(restTemplate, times(1)).exchange(
            eq("http://localhost:8080/quotes/MSFT"), eq(HttpMethod.GET),
            any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }

    @Test
    @DisplayName("URL construction with base URL ending with slash")
    void testUrlConstructionWithTrailingSlash() {
        FauxnanceClient clientWithSlash = new FauxnanceClient(
            restTemplate,
            "http://localhost:8080/",
            API_KEY,
            MAX_RETRIES,
            RETRY_DELAY_MS
        );
        QuoteResponse expectedQuote = quote("GOOG", "2500.00");
        QuoteResponseWrapper wrapper = new QuoteResponseWrapper(expectedQuote, null);

        when(restTemplate.exchange(
                eq("http://localhost:8080/quotes/GOOG"), eq(HttpMethod.GET),
                any(HttpEntity.class), eq(QuoteResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        Optional<QuoteResponse> result = clientWithSlash.getQuote("GOOG");

        assertTrue(result.isPresent());
        verify(restTemplate, times(1)).exchange(
            eq("http://localhost:8080/quotes/GOOG"), eq(HttpMethod.GET),
            any(HttpEntity.class), eq(QuoteResponseWrapper.class));
    }

    // ========== Batch tests ==========

    @Test
    @DisplayName("Batch fetch up to 25 symbols in one request")
    void testBatchFetchUpTo25Symbols() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG", "MSFT", "AMZN", "NVDA", "TSLA", "META", "NFLX");
        BatchQuotesResponseWrapper wrapper = batchWrapper(symbols);

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(BatchQuotesResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);

        assertEquals(8, result.size());
        verify(restTemplate, times(1)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(BatchQuotesResponseWrapper.class));

        for (String symbol : symbols) {
            assertTrue(result.stream().anyMatch(q -> q.getSymbol().equals(symbol)),
                "Symbol " + symbol + " should be in results");
        }
    }

    @Test
    @DisplayName("Batch fetch 26 symbols (requires 2 batches: 25 + 1)")
    void testBatchFetch26SymbolsMultipleBatches() {
        List<String> symbols = new ArrayList<>();
        for (int i = 0; i < 26; i++) {
            symbols.add("SYM" + String.format("%02d", i));
        }

        BatchQuotesResponseWrapper firstBatch = batchWrapper(symbols.subList(0, 25));
        BatchQuotesResponseWrapper secondBatch = batchWrapper(symbols.subList(25, 26));

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(BatchQuotesResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(firstBatch, HttpStatus.OK))
            .thenReturn(new ResponseEntity<>(secondBatch, HttpStatus.OK));

        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);

        assertEquals(26, result.size());
        verify(restTemplate, times(2)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(BatchQuotesResponseWrapper.class));
    }

    @Test
    @DisplayName("Batch fetch with retry on transient failure")
    void testBatchFetchWithRetry() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG");
        BatchQuotesResponseWrapper wrapper = batchWrapper(symbols);

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(BatchQuotesResponseWrapper.class)))
            .thenThrow(new RestClientException("Connection timeout"))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);

        assertEquals(2, result.size());
        verify(restTemplate, times(2)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(BatchQuotesResponseWrapper.class));
    }

    @Test
    @DisplayName("Batch fetch fails after max retries")
    void testBatchFetchMaxRetriesExceeded() {
        List<String> symbols = Arrays.asList("AAPL");

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(BatchQuotesResponseWrapper.class)))
            .thenThrow(new RestClientException("Connection lost"));

        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(symbols);

        assertEquals(0, result.size());
        verify(restTemplate, times(MAX_RETRIES)).exchange(
            anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
            eq(BatchQuotesResponseWrapper.class));
    }

    @Test
    @DisplayName("Batch fetch skips items with errors")
    void testBatchFetchSkipsErrorItems() {
        BatchQuotesResponseWrapper wrapper = new BatchQuotesResponseWrapper();
        BatchQuotesData data = new BatchQuotesData();
        BatchQuoteItem ok = new BatchQuoteItem();
        ok.setSymbol("AAPL");
        ok.setQuote(quote("AAPL", "10.00"));
        BatchQuoteItem bad = new BatchQuoteItem();
        bad.setSymbol("BAD");
        bad.setError("not found");
        data.setQuotes(Arrays.asList(ok, bad));
        wrapper.setData(data);

        when(restTemplate.exchange(
                anyString(), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(BatchQuotesResponseWrapper.class)))
            .thenReturn(new ResponseEntity<>(wrapper, HttpStatus.OK));

        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(Arrays.asList("AAPL", "BAD"));

        assertEquals(1, result.size());
        assertEquals("AAPL", result.get(0).getSymbol());
    }

    @Test
    @DisplayName("Batch fetch with empty symbol list")
    void testBatchFetchEmptySymbolList() {
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(new ArrayList<>());

        assertEquals(0, result.size());
        verify(restTemplate, never()).exchange(
            anyString(), any(), any(), any(Class.class));
    }

    @Test
    @DisplayName("Batch fetch with null symbol list")
    void testBatchFetchNullSymbolList() {
        List<QuoteResponse> result = fauxnanceClient.getQuotesBatch(null);

        assertEquals(0, result.size());
        verify(restTemplate, never()).exchange(
            anyString(), any(), any(), any(Class.class));
    }

    // ========== Helpers ==========

    private QuoteResponse quote(String symbol, String price) {
        return new QuoteResponse(
            symbol,
            new BigDecimal(price),
            new BigDecimal(price).subtract(new BigDecimal("0.01")),
            new BigDecimal(price).add(new BigDecimal("0.01")),
            System.currentTimeMillis()
        );
    }

    private BatchQuotesResponseWrapper batchWrapper(List<String> symbols) {
        BatchQuotesResponseWrapper wrapper = new BatchQuotesResponseWrapper();
        BatchQuotesData data = new BatchQuotesData();
        List<BatchQuoteItem> items = new ArrayList<>();
        for (String symbol : symbols) {
            BatchQuoteItem item = new BatchQuoteItem();
            item.setSymbol(symbol);
            item.setQuote(quote(symbol, "100.00"));
            items.add(item);
        }
        data.setQuotes(items);
        wrapper.setData(data);
        return wrapper;
    }
}
