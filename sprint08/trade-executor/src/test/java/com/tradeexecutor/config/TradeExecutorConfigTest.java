package com.tradeexecutor.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertNotNull;

@DisplayName("TradeExecutorConfig beans")
class TradeExecutorConfigTest {

    @Test
    @DisplayName("The application exposes a RestTemplate bean")
    void createsRestTemplate() {
        RestTemplate restTemplate = new TradeExecutorConfig().restTemplate();

        assertNotNull(restTemplate);
    }
}
