package com.tradingsystem.spring_boot_app.notification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Email channel. auth-service owns the customer's (encrypted) address and the
 * SMTP configuration, so order-service names the user and auth-service
 * resolves the address and sends the mail (POST /internal/notifications/email).
 * The address never reaches order-service, its logs or its database.
 *
 * <p>Authenticated with a one-minute internal service token that only
 * auth-service's internal routes accept. Timeouts are short so a slow mail
 * server cannot hold the trade-events listener for long.
 */
@Component
public class AuthServiceEmailClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthServiceEmailClient.class);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);

    private final URI endpoint;
    private final JwtTokenProvider tokens;
    private final ObjectMapper json;
    private final HttpClient http;

    public AuthServiceEmailClient(@Value("${app.auth.url}") String authUrl,
                                  JwtTokenProvider tokens,
                                  ObjectMapper json) {
        this.endpoint = URI.create(authUrl.replaceAll("/+$", "") + "/internal/notifications/email");
        this.tokens = tokens;
        this.json = json;
        this.http = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
    }

    /**
     * Ask auth-service to email the user.
     *
     * @return true only when auth-service reports the mail server accepted it
     */
    public boolean sendEmail(String userId, String subject, String message) {
        try {
            String body = json.writeValueAsString(Map.of("userId", userId, "subject", subject, "message", message));
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(REQUEST_TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + tokens.createInternalServiceToken())
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 == 2) {
                return true;
            }
            LOGGER.warn("Notification email for user {} not sent: auth-service answered {}", userId, response.statusCode());
            return false;
        } catch (JsonProcessingException e) {
            LOGGER.error("Notification email for user {} could not be encoded", userId, e);
            return false;
        } catch (IOException e) {
            LOGGER.warn("Notification email for user {} not sent: auth-service unreachable ({})", userId, e.getMessage());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
