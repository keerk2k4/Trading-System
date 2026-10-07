package com.tradingsystem.spring_boot_app.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("AuthServiceEmailClient asks auth-service to send the email")
class AuthServiceEmailClientTest {

    private static final String SECRET = "client-test-secret-key-at-least-32-chars";
    private static final String USER_ID = "8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f";

    private final ObjectMapper json = new ObjectMapper();
    private final AtomicInteger status = new AtomicInteger(200);
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();
    private HttpServer server;
    private AuthServiceEmailClient client;

    @BeforeEach
    void startFakeAuthService() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            path.set(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(status.get(), -1);
            exchange.close();
        });
        server.start();
        String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/";
        client = new AuthServiceEmailClient(url, new JwtTokenProvider(SECRET), json);
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    @DisplayName("posts the user, subject and message with an internal service token")
    void postsToInternalRoute() throws IOException {
        assertTrue(client.sendEmail(USER_ID, "Order filled: AAPL", "Your order has been filled."));

        assertEquals("POST /internal/notifications/email", path.get());
        JsonNode sent = json.readTree(body.get());
        assertEquals(USER_ID, sent.get("userId").asText());
        assertEquals("Order filled: AAPL", sent.get("subject").asText());
        assertEquals("Your order has been filled.", sent.get("message").asText());

        Claims claims = Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .build()
                .parseSignedClaims(authorization.get().substring("Bearer ".length()))
                .getPayload();
        assertEquals("order-service", claims.get("service", String.class));
        assertEquals("auth-internal", claims.get("scope", String.class));
        assertEquals("order-service", claims.getIssuer());
    }

    @Test
    @DisplayName("reports failure when auth-service could not send it")
    void failureStatusIsFalse() {
        status.set(502);
        assertFalse(client.sendEmail(USER_ID, "Order filled: AAPL", "Filled."));
    }

    @Test
    @DisplayName("reports failure when auth-service is down")
    void unreachableIsFalse() {
        server.stop(0);
        assertFalse(client.sendEmail(USER_ID, "Order filled: AAPL", "Filled."));
    }
}
