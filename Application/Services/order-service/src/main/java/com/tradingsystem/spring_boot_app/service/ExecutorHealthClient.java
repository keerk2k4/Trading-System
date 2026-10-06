package com.tradingsystem.spring_boot_app.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse.ServiceHealth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Asks the Trade Executor for {@code /actuator/health/dependencies}, which
 * names its failing dependency (db, kafka) with UP or DOWN and nothing more.
 *
 * <p>Any answer means the Executor is running, so a failing dependency makes it
 * DEGRADED ("running, but can't reach Kafka"), never DOWN: the admin is sent to
 * the broken dependency rather than told to restart a healthy process. DOWN is
 * kept for no answer at all, or none within {@link #TIMEOUT}. The Executor
 * answers 503 when degraded; that is read as an answer, not thrown. The
 * address comes from {@code EXECUTOR_URL}; the browser never calls it.
 */
@Component
public class ExecutorHealthClient {

    static final String NAME = "Trade Executor";
    /**
     * Longer than the Executor's own Kafka check (KafkaHealthIndicator.TIMEOUT,
     * 2 s): with Kafka down the Executor answers only after that check gives
     * up, and a shorter wait here would mistake "running, can't reach Kafka"
     * for "not answering".
     */
    static final Duration TIMEOUT = Duration.ofSeconds(3);
    private static final Logger LOGGER = LoggerFactory.getLogger(ExecutorHealthClient.class);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Autowired
    public ExecutorHealthClient(RestClient.Builder builder, ObjectMapper objectMapper,
                                @Value("${app.executor.url}") String executorUrl) {
        this(builder.baseUrl(executorUrl).requestFactory(timeouts()).build(), objectMapper);
    }

    ExecutorHealthClient(RestClient restClient, ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
    }

    public ServiceHealth check() {
        long started = System.nanoTime();
        try {
            Answer answer = restClient.get()
                    .uri("/actuator/health/dependencies")
                    .exchange((request, response) -> new Answer(
                            response.getStatusCode().value(), readJson(response.getBody().readAllBytes())));
            long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            if (answer.httpStatus() == 404) {
                // An Executor built before the dependencies view existed.
                return new ServiceHealth(NAME, "UNKNOWN", elapsed,
                        "Running, but too old to report its dependencies; restart it with the current build");
            }
            return switch (answer.body().path("status").asText("")) {
                case "UP" -> new ServiceHealth(NAME, "UP", elapsed, "Responded in " + elapsed + " ms");
                case "DOWN", "OUT_OF_SERVICE" -> new ServiceHealth(NAME, "DEGRADED", elapsed,
                        "Running, but " + failing(answer.body().path("components")));
                default -> new ServiceHealth(NAME, "UNKNOWN", elapsed, "Answered with an unrecognised status");
            };
        } catch (ResourceAccessException e) {
            boolean timedOut = e.getCause() instanceof SocketTimeoutException;
            LOGGER.warn("Executor health check: {}", timedOut ? "timed out" : "not reachable");
            return new ServiceHealth(NAME, "DOWN", null,
                    timedOut ? "No response within " + TIMEOUT.toSeconds() + " s" : "Not reachable");
        } catch (RuntimeException e) {
            LOGGER.warn("Executor health check failed: {}", e.getClass().getSimpleName());
            return new ServiceHealth(NAME, "DOWN", null, "Check failed");
        }
    }

    /** Names what is failing, in words; falls back to both when the Executor does not say. */
    private static String failing(JsonNode components) {
        boolean db = isDown(components.path("db"));
        boolean kafka = isDown(components.path("kafka"));
        if (db && kafka) {
            return "can't reach its database or Kafka";
        }
        if (kafka) {
            return "can't reach Kafka";
        }
        if (db) {
            return "can't reach its database";
        }
        return "its database or Kafka connection is failing";
    }

    private static boolean isDown(JsonNode component) {
        String status = component.path("status").asText("");
        return "DOWN".equals(status) || "OUT_OF_SERVICE".equals(status);
    }

    private record Answer(int httpStatus, JsonNode body) {
    }

    private JsonNode readJson(byte[] body) {
        try {
            return objectMapper.readTree(body);
        } catch (IOException e) {
            return MissingNode.getInstance();
        }
    }

    private static SimpleClientHttpRequestFactory timeouts() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(TIMEOUT);
        factory.setReadTimeout(TIMEOUT);
        return factory;
    }
}
