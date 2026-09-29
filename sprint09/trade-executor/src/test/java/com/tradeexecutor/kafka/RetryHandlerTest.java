package com.tradeexecutor.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("RetryHandler configuration and backoff behavior")
class RetryHandlerTest {

    private RetryHandler retryHandler;

    @BeforeEach
    void setUp() {
        retryHandler = new RetryHandler();
        ReflectionTestUtils.setField(retryHandler, "maxRetries", 3);
        ReflectionTestUtils.setField(retryHandler, "initialBackoffMs", 100L);
        ReflectionTestUtils.setField(retryHandler, "backoffMultiplier", 2.0);
        ReflectionTestUtils.setField(retryHandler, "maxBackoffMs", 10_000L);
    }

    @Test
    @DisplayName("shouldRetry uses a one-based attempt number and stops at the configured limit")
    void shouldRetryHonorsAttemptBoundary() {
        assertTrue(retryHandler.shouldRetry(1));
        assertTrue(retryHandler.shouldRetry(2));
        assertFalse(retryHandler.shouldRetry(3));
        assertFalse(retryHandler.shouldRetry(4));
        assertEquals(3, retryHandler.getMaxRetries());
    }

    @Test
    @DisplayName("calculateBackoffMs grows exponentially from the initial delay")
    void calculateBackoffUsesExponentialSequence() {
        assertEquals(100L, retryHandler.calculateBackoffMs(1));
        assertEquals(200L, retryHandler.calculateBackoffMs(2));
        assertEquals(400L, retryHandler.calculateBackoffMs(3));
    }

    @Test
    @DisplayName("calculateBackoffMs caps a large exponential value")
    void calculateBackoffIsCapped() {
        ReflectionTestUtils.setField(retryHandler, "maxBackoffMs", 250L);

        assertEquals(100L, retryHandler.calculateBackoffMs(1));
        assertEquals(200L, retryHandler.calculateBackoffMs(2));
        assertEquals(250L, retryHandler.calculateBackoffMs(3));
    }

    @Test
    @DisplayName("waitForBackoff returns normally for a zero delay")
    void waitForZeroBackoffReturnsNormally() {
        ReflectionTestUtils.setField(retryHandler, "initialBackoffMs", 0L);

        retryHandler.waitForBackoff(1);
    }

    @Test
    @DisplayName("waitForBackoff restores the interrupt flag when sleeping is interrupted")
    void waitForBackoffPreservesInterrupt() {
        ReflectionTestUtils.setField(retryHandler, "initialBackoffMs", 1_000L);
        Thread.currentThread().interrupt();

        try {
            retryHandler.waitForBackoff(1);

            assertTrue(Thread.currentThread().isInterrupted());
        } finally {
            // Do not leak the test thread's interrupt state to the next test.
            Thread.interrupted();
        }
    }
}
