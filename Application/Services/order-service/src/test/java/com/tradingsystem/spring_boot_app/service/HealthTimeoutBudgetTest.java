package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.kafka.KafkaHealthIndicator;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Each health check must wait longer than the check it is waiting on. With
 * Kafka down, the Executor answers only after its own 2-second Kafka check
 * gives up; a caller with the same or a shorter limit reports a degraded
 * Executor as one that is not answering at all.
 */
class HealthTimeoutBudgetTest {

    @Test
    void executorCallWaitsLongerThanTheExecutorsOwnKafkaCheck() throws Exception {
        // The Executor's Kafka check is a copy of this service's, with the same limit.
        assertTrue(ExecutorHealthClient.TIMEOUT.compareTo(kafkaTimeout()) > 0,
                "ExecutorHealthClient.TIMEOUT must exceed KafkaHealthIndicator.TIMEOUT");
    }

    @Test
    void platformLimitWaitsLongerThanEveryCheckInsideIt() throws Exception {
        assertTrue(PlatformHealthService.CHECK_TIMEOUT.compareTo(ExecutorHealthClient.TIMEOUT) > 0,
                "PlatformHealthService.CHECK_TIMEOUT must exceed ExecutorHealthClient.TIMEOUT");
        assertTrue(PlatformHealthService.CHECK_TIMEOUT.compareTo(kafkaTimeout()) > 0,
                "PlatformHealthService.CHECK_TIMEOUT must exceed KafkaHealthIndicator.TIMEOUT");
    }

    private static Duration kafkaTimeout() throws Exception {
        Field field = KafkaHealthIndicator.class.getDeclaredField("TIMEOUT");
        field.setAccessible(true);
        return (Duration) field.get(null);
    }
}
