package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse;
import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse.ServiceHealth;
import com.tradingsystem.spring_boot_app.exception.ForbiddenException;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.PlatformHealthService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminHealthController.class)
class AdminHealthControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PlatformHealthService platformHealth;

    @MockitoBean
    private AuthService authService;

    @Test
    void adminGetsEveryServiceIncludingOneThatIsDown() throws Exception {
        when(platformHealth.check()).thenReturn(new AdminHealthResponse("DEGRADED", Instant.parse("2026-10-06T10:00:00Z"),
                List.of(new ServiceHealth("Trade API", "UP", 4L, "Running; database answered"),
                        new ServiceHealth("Kafka", "UP", 35L, "1 broker reachable"),
                        new ServiceHealth("Trade Executor", "DOWN", null, "Not reachable"))));

        mvc.perform(get("/api/v1/admin/health").header("Authorization", "Bearer admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overall").value("DEGRADED"))
                .andExpect(jsonPath("$.checkedAt").value("2026-10-06T10:00:00Z"))
                .andExpect(jsonPath("$.services[2].name").value("Trade Executor"))
                .andExpect(jsonPath("$.services[2].status").value("DOWN"))
                .andExpect(jsonPath("$.services[2].detail").value("Not reachable"));
    }

    @Test
    void customerTokenIsRefusedWithAuth403AndNothingIsChecked() throws Exception {
        doThrow(new ForbiddenException()).when(authService).requireAdmin(any(HttpServletRequest.class));

        mvc.perform(get("/api/v1/admin/health").header("Authorization", "Bearer customer"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("AUTH-403"))
                .andExpect(jsonPath("$.message").value("Forbidden"));
        verifyNoInteractions(platformHealth);
    }

    @Test
    void missingTokenIsRefusedWithAuth401AndNothingIsChecked() throws Exception {
        doThrow(new UnauthorisedException()).when(authService).requireAdmin(any(HttpServletRequest.class));

        mvc.perform(get("/api/v1/admin/health"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        verifyNoInteractions(platformHealth);
    }
}
