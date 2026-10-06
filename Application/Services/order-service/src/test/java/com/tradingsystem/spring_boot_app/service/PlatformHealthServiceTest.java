package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse;
import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse.ServiceHealth;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.boot.actuate.health.HealthIndicator;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PlatformHealthServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");
    private static final ServiceHealth EXECUTOR_UP = new ServiceHealth("Trade Executor", "UP", 12L, "Responded in 12 ms");

    private HealthContributorRegistry registry;
    private HealthIndicator db;
    private HealthIndicator kafka;
    private ExecutorHealthClient executor;
    private MutableClock clock;
    private PlatformHealthService service;

    @BeforeEach
    void setUp() {
        registry = mock(HealthContributorRegistry.class);
        db = mock(HealthIndicator.class);
        kafka = mock(HealthIndicator.class);
        executor = mock(ExecutorHealthClient.class);
        when(registry.getContributor("db")).thenReturn(db);
        when(registry.getContributor("kafka")).thenReturn(kafka);
        when(db.getHealth(anyBoolean())).thenReturn(Health.up().build());
        when(kafka.getHealth(anyBoolean())).thenReturn(Health.up().withDetail("brokers", 1).build());
        when(executor.check()).thenReturn(EXECUTOR_UP);
        clock = new MutableClock(NOW);
        service = new PlatformHealthService(registry, executor, Duration.ofMillis(300), clock);
    }

    @AfterEach
    void tearDown() {
        service.shutdown();
    }

    @Test
    void reportsUpWhenEveryServiceIsUp() {
        AdminHealthResponse health = service.check();

        assertEquals("UP", health.overall());
        assertEquals(NOW, health.checkedAt());
        assertEquals("Trade API", health.services().get(0).name());
        assertEquals("Running; database answered", health.services().get(0).detail());
        assertEquals("1 broker reachable", health.services().get(1).detail());
        assertEquals(EXECUTOR_UP, health.services().get(2));
    }

    @Test
    void reportsDegradedWithTheReasonWhenKafkaIsDown() {
        when(kafka.getHealth(anyBoolean())).thenReturn(Health.down().withDetail("detail", "Broker unreachable").build());

        AdminHealthResponse health = service.check();

        assertEquals("DEGRADED", health.overall());
        assertEquals(new ServiceHealth("Kafka", "DOWN", null, "Broker unreachable"), health.services().get(1));
    }

    @Test
    void reportsTheTradeApiDegradedWhenItsDatabaseIsNotAnswering() {
        when(db.getHealth(anyBoolean())).thenReturn(Health.down().build());

        ServiceHealth tradeApi = service.check().services().get(0);

        assertEquals(new ServiceHealth("Trade API", "DEGRADED", null, "Running, but its database is not answering"), tradeApi);
    }

    @Test
    void reportsDownForACheckThatDoesNotFinishInTime() throws Exception {
        CountDownLatch neverReleased = new CountDownLatch(1);
        when(executor.check()).thenAnswer(invocation -> {
            neverReleased.await();
            return EXECUTOR_UP;
        });

        AdminHealthResponse health = service.check();

        assertEquals("DEGRADED", health.overall());
        assertEquals(new ServiceHealth("Trade Executor", "DOWN", null, "No response within 300 ms"), health.services().get(2));
        assertEquals("UP", health.services().get(0).status());
    }

    @Test
    void reportsDownForACheckThatThrows() {
        when(kafka.getHealth(anyBoolean())).thenThrow(new IllegalStateException("kafka-internal:9092"));

        assertEquals(new ServiceHealth("Kafka", "DOWN", null, "Check failed"), service.check().services().get(1));
    }

    @Test
    void reportsUnknownWhenACheckIsNotConfigured() {
        when(registry.getContributor("db")).thenReturn(null);

        assertEquals("UNKNOWN", service.check().services().get(0).status());
    }

    @Test
    void reusesTheLastAnswerForFiveSecondsThenChecksAgain() {
        AdminHealthResponse first = service.check();
        clock.advance(Duration.ofSeconds(4));
        assertSame(first, service.check());
        verify(executor, times(1)).check();

        clock.advance(Duration.ofSeconds(1));
        service.check();
        verify(executor, times(2)).check();
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }
}
