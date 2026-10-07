package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.NotificationResponse;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.notification.NotificationStatus;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.NotificationService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(NotificationController.class)
class NotificationControllerTest {

    private static final String TOKEN = "Bearer test-token";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private NotificationService notifications;

    @MockitoBean
    private AuthService authService;

    @BeforeEach
    void mockAuthGuard() {
        doAnswer(invocation -> 6L).when(authService).authenticatedAccountId(any(HttpServletRequest.class));
    }

    @Test
    void getMyNotificationsAnswers200WithHistory() throws Exception {
        when(notifications.getHistory(eq(6L))).thenReturn(List.of(
                new NotificationResponse(1L, "evt-1", 6L, NotificationType.ORDER_FILLED,
                        "Order filled: ACME", "Your order for 10 ACME (BUY) has been filled at 25.50.",
                        AlertChannel.EMAIL, NotificationStatus.SENT,
                        OffsetDateTime.of(2026, 10, 7, 9, 0, 0, 0, ZoneOffset.UTC),
                        OffsetDateTime.of(2026, 10, 7, 9, 0, 1, 0, ZoneOffset.UTC))));

        mvc.perform(get("/api/v1/notifications/me").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventId").value("evt-1"))
                .andExpect(jsonPath("$[0].type").value("ORDER_FILLED"))
                .andExpect(jsonPath("$[0].channel").value("EMAIL"))
                .andExpect(jsonPath("$[0].status").value("SENT"));
    }

    @Test
    void missingTokenIsAuth401Envelope() throws Exception {
        doAnswer(invocation -> {
            throw new UnauthorisedException();
        }).when(authService).authenticatedAccountId(any(HttpServletRequest.class));

        mvc.perform(get("/api/v1/notifications/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        verifyNoInteractions(notifications);
    }
}
