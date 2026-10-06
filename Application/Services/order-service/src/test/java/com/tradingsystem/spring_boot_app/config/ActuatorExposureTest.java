package com.tradingsystem.spring_boot_app.config;

import com.tradingsystem.spring_boot_app.kafka.KafkaHealthIndicator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The public health endpoint is reachable without a token, says UP or DOWN
 * with no component detail, and no other actuator endpoint is published.
 */
@SpringBootTest(properties = {
        // The database check is Spring's own; switched off here so the test
        // needs no database and runs in milliseconds.
        "management.health.db.enabled=false",
        "management.endpoint.health.cache.time-to-live=0ms"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ActuatorExposureTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean(name = "kafka")
    private KafkaHealthIndicator kafka;

    @Test
    void healthAnswersUpWithoutAToken() throws Exception {
        when(kafka.getHealth(anyBoolean())).thenReturn(Health.up().withDetail("brokers", 1).build());

        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());
    }

    @Test
    void healthAnswers503WithoutTheReasonWhenKafkaIsDown() throws Exception {
        when(kafka.getHealth(anyBoolean())).thenReturn(Health.down().withDetail("detail", "Broker unreachable").build());

        mvc.perform(get("/actuator/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DOWN"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(content().string(not(containsString("Broker unreachable"))));
    }

    @Test
    void livenessProbeIsAvailableForContainerRestarts() throws Exception {
        mvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk());
    }

    @Test
    void noOtherActuatorEndpointIsPublished() throws Exception {
        for (String path : new String[]{"/actuator/env", "/actuator/beans", "/actuator/configprops",
                "/actuator/heapdump", "/actuator/loggers", "/actuator/mappings"}) {
            mvc.perform(get(path)).andExpect(status().isNotFound());
        }
    }
}
