package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse;
import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse.ServiceHealth;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthContributor;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.health.Status;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * The platform's health for the admin dashboard: this service's database,
 * Kafka, and the Trade Executor. The Auth service is not asked from here; the
 * browser asks it directly, so calls between the services stay one-way.
 *
 * <p>The three checks run at the same time, each limited to
 * {@link #CHECK_TIMEOUT}, so one stalled dependency cannot hold the page.
 * Results are reused for {@link #CACHE_FOR}, so several admins refreshing do
 * not multiply the load on the database, the broker or the Executor.
 */
@Service
public class PlatformHealthService {

    /** Longer than every check inside it: Kafka (2 s) and the Executor call (3 s). */
    static final Duration CHECK_TIMEOUT = Duration.ofSeconds(4);
    static final Duration CACHE_FOR = Duration.ofSeconds(5);

    private final HealthContributorRegistry registry;
    private final ExecutorHealthClient executorHealth;
    private final Duration checkTimeout;
    private final Clock clock;
    private final ExecutorService checks = Executors.newFixedThreadPool(3, runnable -> {
        Thread thread = new Thread(runnable, "platform-health");
        thread.setDaemon(true);
        return thread;
    });

    private AdminHealthResponse cached;

    @Autowired
    public PlatformHealthService(HealthContributorRegistry registry, ExecutorHealthClient executorHealth) {
        this(registry, executorHealth, CHECK_TIMEOUT, Clock.systemUTC());
    }

    PlatformHealthService(HealthContributorRegistry registry, ExecutorHealthClient executorHealth,
                          Duration checkTimeout, Clock clock) {
        this.registry = registry;
        this.executorHealth = executorHealth;
        this.checkTimeout = checkTimeout;
        this.clock = clock;
    }

    public synchronized AdminHealthResponse check() {
        Instant now = clock.instant();
        if (cached != null && now.isBefore(cached.checkedAt().plus(CACHE_FOR))) {
            return cached;
        }

        CompletableFuture<ServiceHealth> tradeApi = limited("Trade API", this::tradeApi);
        CompletableFuture<ServiceHealth> kafka = limited("Kafka", this::kafka);
        CompletableFuture<ServiceHealth> executor = limited(ExecutorHealthClient.NAME, executorHealth::check);

        List<ServiceHealth> services = List.of(tradeApi.join(), kafka.join(), executor.join());
        boolean allUp = services.stream().allMatch(service -> "UP".equals(service.status()));
        cached = new AdminHealthResponse(allUp ? "UP" : "DEGRADED", now, services);
        return cached;
    }

    /** The Trade API is answering this request, so its own state is its database's. */
    private ServiceHealth tradeApi() {
        Probe db = probe("db");
        if (db == null) {
            return new ServiceHealth("Trade API", "UNKNOWN", null, "No database check is configured");
        }
        return db.up()
                ? new ServiceHealth("Trade API", "UP", db.responseMs(), "Running; database answered")
                // It is answering this request, so it is running: degraded, not down.
                : new ServiceHealth("Trade API", "DEGRADED", null, "Running, but its database is not answering");
    }

    private ServiceHealth kafka() {
        Probe kafka = probe("kafka");
        if (kafka == null) {
            return new ServiceHealth("Kafka", "UNKNOWN", null, "No Kafka check is configured");
        }
        if (kafka.up()) {
            String brokers = kafka.details().get("brokers") instanceof Integer count
                    ? count + (count == 1 ? " broker" : " brokers") + " reachable"
                    : "Reachable";
            return new ServiceHealth("Kafka", "UP", kafka.responseMs(), brokers);
        }
        // KafkaHealthIndicator's detail is already a fixed sentence.
        String reason = kafka.details().get("detail") instanceof String text ? text : "Not reachable";
        return new ServiceHealth("Kafka", kafka.status(), null, reason);
    }

    /**
     * Runs one of this service's own actuator checks directly, with its
     * details, which the public endpoint never shows.
     *
     * @return the outcome, or null when no check of that name is registered
     */
    private Probe probe(String contributorName) {
        HealthContributor contributor = registry.getContributor(contributorName);
        if (!(contributor instanceof HealthIndicator indicator)) {
            return null;
        }
        long started = System.nanoTime();
        Health health = indicator.getHealth(true);
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        return new Probe(toStatus(health.getStatus()), elapsed, health.getDetails());
    }

    private record Probe(String status, long responseMs, Map<String, Object> details) {
        boolean up() {
            return "UP".equals(status);
        }
    }

    private CompletableFuture<ServiceHealth> limited(String name, Supplier<ServiceHealth> check) {
        return CompletableFuture.supplyAsync(check, checks)
                .exceptionally(failure -> new ServiceHealth(name, "DOWN", null, "Check failed"))
                .completeOnTimeout(new ServiceHealth(name, "DOWN", null, "No response within " + limitText()),
                        checkTimeout.toMillis(), TimeUnit.MILLISECONDS);
    }

    private String limitText() {
        return checkTimeout.toMillis() % 1000 == 0
                ? checkTimeout.toSeconds() + " s"
                : checkTimeout.toMillis() + " ms";
    }

    private static String toStatus(Status status) {
        if (Status.UP.equals(status)) {
            return "UP";
        }
        if (Status.DOWN.equals(status) || Status.OUT_OF_SERVICE.equals(status)) {
            return "DOWN";
        }
        return "UNKNOWN";
    }

    @PreDestroy
    void shutdown() {
        checks.shutdownNow();
    }
}
