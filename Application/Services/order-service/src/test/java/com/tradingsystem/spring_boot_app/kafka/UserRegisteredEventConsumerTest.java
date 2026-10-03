package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.service.InternalAccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;

class UserRegisteredEventConsumerTest {

    private InternalAccountService internalAccountService;
    private UserRegisteredEventConsumer consumer;

    @BeforeEach
    void setUp() {
        internalAccountService = Mockito.mock(InternalAccountService.class);
        consumer = new UserRegisteredEventConsumer(new ObjectMapper(), internalAccountService);
    }

    @Test
    void consumesValidUserRegisteredEvent() {
        String message = """
                {
                  "eventType": "USER_REGISTERED",
                  "payload": {
                    "userId": "user-123",
                    "username": "alice"
                  }
                }
                """;

        consumer.consumeUserRegisteredEvent(message);

        verify(internalAccountService).createAccountForUserIfMissing("user-123");
    }

    @Test
    void throwsForUnexpectedEventType() {
        String message = """
                {
                  "eventType": "OTHER_EVENT",
                  "payload": {
                    "userId": "user-123"
                  }
                }
                """;

        assertThrows(IllegalStateException.class, () -> consumer.consumeUserRegisteredEvent(message));
    }

    @Test
    void throwsWhenUserIdMissing() {
        String message = """
                {
                  "eventType": "USER_REGISTERED",
                  "payload": {
                    "username": "alice"
                  }
                }
                """;

        assertThrows(IllegalStateException.class, () -> consumer.consumeUserRegisteredEvent(message));
    }
}
