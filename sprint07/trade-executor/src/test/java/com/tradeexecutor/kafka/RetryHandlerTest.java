package com.tradeexecutor.kafka;

import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for RetryHandler.
 */
@DisplayName("RetryHandler Tests")
class RetryHandlerTest {
    
    private RetryHandler retryHandler;
    
    @BeforeEach
    void setUp() {
        retryHandler = new RetryHandler();
        // Set default values
        ReflectionTestUtils.setField(retryHandler, "maxRetryAttempts", 3);
        ReflectionTestUtils.setField(retryHandler, "initialDelayMs", 100L);
        ReflectionTestUtils.setField(retryHandler, "maxDelayMs", 30000L);
        ReflectionTestUtils.setField(retryHandler, "backoffMultiplier", 2.0);
    }
    
    @Test
    @DisplayName("Get retry count from headers")
    void testGetRetryCount() {
        // Given: Headers with retry count
        RecordHeaders headers = new RecordHeaders();
        headers.add(new RecordHeader("x-retry-count", "2".getBytes(StandardCharsets.UTF_8)));
        
        // When: Getting retry count
        int count = retryHandler.getRetryCount(headers);
        
        // Then: Should return 2
        assertEquals(2, count);
    }
    
    @Test
    @DisplayName("Get retry count returns 0 when header missing")
    void testGetRetryCountReturnsZeroWhenMissing() {
        // Given: Empty headers
        RecordHeaders headers = new RecordHeaders();
        
        // When: Getting retry count
        int count = retryHandler.getRetryCount(headers);
        
        // Then: Should return 0
        assertEquals(0, count);
    }
    
    @Test
    @DisplayName("Get retry count handles null headers")
    void testGetRetryCountHandlesNullHeaders() {
        // Given: Null headers
        // When: Getting retry count
        int count = retryHandler.getRetryCount(null);
        
        // Then: Should return 0
        assertEquals(0, count);
    }
    
    @Test
    @DisplayName("Should retry when retry count < max attempts")
    void testShouldRetryWhenBudgetNotExhausted() {
        // Given: Headers with retry count 0 (out of max 3)
        RecordHeaders headers = new RecordHeaders();
        headers.add(new RecordHeader("x-retry-count", "0".getBytes(StandardCharsets.UTF_8)));
        // No next retry time, so it's ready to retry now
        
        // When: Checking if should retry
        boolean shouldRetry = retryHandler.shouldRetry(headers);
        
        // Then: Should return true
        assertTrue(shouldRetry);
    }
    
    @Test
    @DisplayName("Should not retry when retry count >= max attempts")
    void testShouldNotRetryWhenBudgetExhausted() {
        // Given: Headers with retry count 3 (max is 3)
        RecordHeaders headers = new RecordHeaders();
        headers.add(new RecordHeader("x-retry-count", "3".getBytes(StandardCharsets.UTF_8)));
        
        // When: Checking if should retry
        boolean shouldRetry = retryHandler.shouldRetry(headers);
        
        // Then: Should return false
        assertFalse(shouldRetry);
    }
    
    @Test
    @DisplayName("Should not retry if next retry time is in the future")
    void testShouldNotRetryIfTimeNotElapsed() {
        // Given: Headers with next retry time in future
        RecordHeaders headers = new RecordHeaders();
        headers.add(new RecordHeader("x-retry-count", "0".getBytes(StandardCharsets.UTF_8)));
        
        long futureTime = System.currentTimeMillis() + 10000; // 10 seconds from now
        headers.add(new RecordHeader("x-next-retry-time", String.valueOf(futureTime).getBytes(StandardCharsets.UTF_8)));
        
        // When: Checking if should retry
        boolean shouldRetry = retryHandler.shouldRetry(headers);
        
        // Then: Should return false (not yet time to retry)
        assertFalse(shouldRetry);
    }
    
    @Test
    @DisplayName("Exponential backoff calculation")
    void testExponentialBackoffCalculation() {
        // Given: RetryHandler with initial delay 100ms and multiplier 2.0
        // When: Calculating backoff for different retry counts
        long backoff0 = retryHandler.calculateBackoffDelayMs(0);
        long backoff1 = retryHandler.calculateBackoffDelayMs(1);
        long backoff2 = retryHandler.calculateBackoffDelayMs(2);
        
        // Then: Verify exponential progression
        assertEquals(100, backoff0);   // 100 * 2^0 = 100
        assertEquals(200, backoff1);   // 100 * 2^1 = 200
        assertEquals(400, backoff2);   // 100 * 2^2 = 400
    }
    
    @Test
    @DisplayName("Backoff is capped at max delay")
    void testBackoffCappedAtMaxDelay() {
        // Given: RetryHandler with high backoff multiplier
        ReflectionTestUtils.setField(retryHandler, "backoffMultiplier", 10.0);
        ReflectionTestUtils.setField(retryHandler, "maxDelayMs", 5000L);
        
        // When: Calculating backoff for high retry count
        long backoff5 = retryHandler.calculateBackoffDelayMs(5);
        
        // Then: Should be capped at maxDelayMs
        assertTrue(backoff5 <= 5000, "Backoff should not exceed maxDelayMs");
    }
    
    @Test
    @DisplayName("Create retry headers increments count")
    void testCreateRetryHeadersIncrementsCount() {
        // Given: Current retry count is 0
        // When: Creating retry headers
        Header[] headers = retryHandler.createRetryHeaders(0);
        
        // Then: Should have retry count header with value 1
        Header retryCountHeader = findHeader(headers, "x-retry-count");
        assertNotNull(retryCountHeader);
        assertEquals("1", new String(retryCountHeader.value(), StandardCharsets.UTF_8));
    }
    
    @Test
    @DisplayName("Create retry headers includes next retry time")
    void testCreateRetryHeadersIncludesNextRetryTime() {
        // Given: Current retry count is 0
        long beforeTime = System.currentTimeMillis();
        
        // When: Creating retry headers
        Header[] headers = retryHandler.createRetryHeaders(0);
        
        long afterTime = System.currentTimeMillis();
        
        // Then: Should have next retry time header
        Header nextRetryTimeHeader = findHeader(headers, "x-next-retry-time");
        assertNotNull(nextRetryTimeHeader);
        
        long nextRetryTime = Long.parseLong(
            new String(nextRetryTimeHeader.value(), StandardCharsets.UTF_8)
        );
        
        // Next retry time should be approximately beforeTime + 100ms (initial backoff)
        assertTrue(nextRetryTime >= beforeTime + 100);
        assertTrue(nextRetryTime <= afterTime + 200); // Allow some margin
    }
    
    @Test
    @DisplayName("Format retry failure reason")
    void testFormatRetryFailureReason() {
        // Given: A failure reason
        String originalReason = "Broker unreachable";
        
        // When: Formatting for retry
        String formatted = retryHandler.formatRetryFailureReason(originalReason, 0);
        
        // Then: Should include attempt info and backoff time
        assertTrue(formatted.contains("Transient failure"));
        assertTrue(formatted.contains("attempt 1/3"));
        assertTrue(formatted.contains("Will retry in"));
        assertTrue(formatted.contains("ms"));
    }
    
    @Test
    @DisplayName("Format retry exhausted reason")
    void testFormatRetryExhaustedReason() {
        // Given: A failure reason
        String originalReason = "Database connection lost";
        
        // When: Formatting for exhausted retry
        String formatted = retryHandler.formatRetryExhaustedFailureReason(originalReason);
        
        // Then: Should include exhaustion info
        assertTrue(formatted.contains("Transient failure persisted after"));
        assertTrue(formatted.contains("3 attempts"));
        assertTrue(formatted.contains("Retry budget exhausted"));
    }
    
    // ========== Helper Methods ==========
    
    private Header findHeader(Header[] headers, String key) {
        for (Header header : headers) {
            if (header.key().equals(key)) {
                return header;
            }
        }
        return null;
    }
}
