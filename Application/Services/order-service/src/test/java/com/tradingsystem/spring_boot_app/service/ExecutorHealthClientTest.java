package com.tradingsystem.spring_boot_app.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse.ServiceHealth;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ExecutorHealthClientTest {

    private MockRestServiceServer executor;
    private ExecutorHealthClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://executor:8081");
        executor = MockRestServiceServer.bindTo(builder).build();
        client = new ExecutorHealthClient(builder.build(), new ObjectMapper());
    }

    @Test
    void reportsUpWithResponseTimeWhenTheExecutorSaysUp() {
        executor.expect(requestTo("http://executor:8081/actuator/health/dependencies"))
                .andRespond(withSuccess("{\"status\":\"UP\"}", MediaType.APPLICATION_JSON));

        ServiceHealth health = client.check();

        assertEquals("UP", health.status());
        assertNotNull(health.responseMs());
    }

    @Test
    void reportsDegradedNamingKafkaWhenOnlyKafkaIsFailing() {
        respond503("{\"status\":\"DOWN\",\"components\":{\"db\":{\"status\":\"UP\"},\"kafka\":{\"status\":\"DOWN\"}}}");

        ServiceHealth health = client.check();

        assertEquals("DEGRADED", health.status());
        assertEquals("Running, but can't reach Kafka", health.detail());
    }

    @Test
    void reportsDegradedNamingTheDatabaseWhenOnlyItIsFailing() {
        respond503("{\"status\":\"DOWN\",\"components\":{\"db\":{\"status\":\"DOWN\"},\"kafka\":{\"status\":\"UP\"}}}");

        assertEquals("Running, but can't reach its database", client.check().detail());
    }

    @Test
    void reportsDegradedNamingBothWhenBothAreFailing() {
        respond503("{\"status\":\"DOWN\",\"components\":{\"db\":{\"status\":\"DOWN\"},\"kafka\":{\"status\":\"DOWN\"}}}");

        assertEquals("Running, but can't reach its database or Kafka", client.check().detail());
    }

    @Test
    void reportsDegradedEvenWhenTheExecutorDoesNotSayWhichDependencyFailed() {
        respond503("{\"status\":\"DOWN\"}");

        ServiceHealth health = client.check();

        assertEquals("DEGRADED", health.status());
        assertEquals("Running, but its database or Kafka connection is failing", health.detail());
    }

    @Test
    void asksForARestartWhenTheExecutorBuildPredatesTheDependenciesView() {
        executor.expect(requestTo("http://executor:8081/actuator/health/dependencies"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"status\":404,\"error\":\"Not Found\"}"));

        ServiceHealth health = client.check();

        assertEquals("UNKNOWN", health.status());
        assertEquals("Running, but too old to report its dependencies; restart it with the current build", health.detail());
    }

    @Test
    void reportsUnknownForAnAnswerItCannotRead() {
        executor.expect(requestTo("http://executor:8081/actuator/health/dependencies"))
                .andRespond(withSuccess("<html>not health</html>", MediaType.TEXT_HTML));

        assertEquals("UNKNOWN", client.check().status());
    }

    @Test
    void reportsDownWhenNothingIsListening() {
        // Port 1 is never a running executor, so the connection is refused.
        ExecutorHealthClient unreachable = new ExecutorHealthClient(
                RestClient.builder(), new ObjectMapper(), "http://127.0.0.1:1");

        assertEquals(new ServiceHealth("Trade Executor", "DOWN", null, "Not reachable"), unreachable.check());
    }

    private void respond503(String body) {
        executor.expect(requestTo("http://executor:8081/actuator/health/dependencies"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).contentType(MediaType.APPLICATION_JSON).body(body));
    }
}
