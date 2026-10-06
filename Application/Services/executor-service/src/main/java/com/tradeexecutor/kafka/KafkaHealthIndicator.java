package com.tradeexecutor.kafka;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.DescribeClusterOptions;
import org.apache.kafka.common.Node;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Collection;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

/**
 * Reports Kafka as the {@code kafka} component of {@code /actuator/health}.
 *
 * <p>Spring Boot ships no Kafka health check, so this asks the cluster for its
 * brokers, the cheapest call that proves the broker is reachable with the
 * same settings the executor's producer and consumers use. A broker that has not
 * answered within {@link #TIMEOUT} is DOWN, so one stalled broker cannot stall
 * the health endpoint. The failure detail is a fixed sentence: the client's
 * exception text names hosts and ports.
 */
@Component("kafka")
public class KafkaHealthIndicator implements HealthIndicator {

    static final Duration TIMEOUT = Duration.ofSeconds(2);
    private static final Logger LOGGER = LoggerFactory.getLogger(KafkaHealthIndicator.class);

    private final Supplier<Admin> adminFactory;

    @Autowired
    public KafkaHealthIndicator(KafkaAdmin kafkaAdmin) {
        this(() -> Admin.create(kafkaAdmin.getConfigurationProperties()));
    }

    KafkaHealthIndicator(Supplier<Admin> adminFactory) {
        this.adminFactory = adminFactory;
    }

    @Override
    public Health health() {
        long started = System.nanoTime();
        Admin admin = null;
        try {
            admin = adminFactory.get();
            Collection<Node> brokers = admin
                    .describeCluster(new DescribeClusterOptions().timeoutMs((int) TIMEOUT.toMillis()))
                    .nodes()
                    .get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            return Health.up()
                    .withDetail("brokers", brokers.size())
                    .withDetail("responseMs", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started))
                    .build();
        } catch (TimeoutException e) {
            LOGGER.warn("Kafka health check: no answer within {}", TIMEOUT);
            return down("No response within " + TIMEOUT.toSeconds() + " s");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return down("Check interrupted");
        } catch (Exception e) {
            LOGGER.warn("Kafka health check failed: {}", e.getClass().getSimpleName());
            return down("Broker unreachable");
        } finally {
            if (admin != null) {
                admin.close(Duration.ofSeconds(1));
            }
        }
    }

    private static Health down(String detail) {
        return Health.down().withDetail("detail", detail).build();
    }
}
