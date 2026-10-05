package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.service.InternalAccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class UserRegisteredEventConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(UserRegisteredEventConsumer.class);

    private final ObjectMapper objectMapper;
    private final InternalAccountService internalAccountService;

    public UserRegisteredEventConsumer(ObjectMapper objectMapper, InternalAccountService internalAccountService) {
        this.objectMapper = objectMapper;
        this.internalAccountService = internalAccountService;
    }

    @KafkaListener(
            topics = "${app.kafka.topics.user-registrations:user-registrations}",
            groupId = "${app.kafka.groups.account-provisioning:account-provisioning}"
    )
    public void consumeUserRegisteredEvent(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String eventType = root.path("eventType").asText();
            String userId = root.path("payload").path("userId").asText();

            if (!"USER_REGISTERED".equals(eventType) || userId == null || userId.isBlank()) {
                throw new IllegalArgumentException("Invalid USER_REGISTERED event payload");
            }

            internalAccountService.createAccountForUserIfMissing(userId);
            LOGGER.info("Processed USER_REGISTERED event for userId={}", userId);
        } catch (Exception e) {
            LOGGER.error("Failed processing USER_REGISTERED event: {}", message, e);
            throw new IllegalStateException("Failed processing USER_REGISTERED event", e);
        }
    }
}
