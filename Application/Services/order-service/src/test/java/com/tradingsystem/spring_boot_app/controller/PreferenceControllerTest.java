package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.PreferenceResponse;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.PreferenceService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PreferenceController.class)
class PreferenceControllerTest {

    private static final String TOKEN = "Bearer test-token";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PreferenceService preferences;

    @MockitoBean
    private AuthService authService;

    @BeforeEach
    void mockAuthGuard() {
        doAnswer(invocation -> 6L).when(authService).authenticatedAccountId(any(HttpServletRequest.class));
    }

    @Test
    void getMyPreferencesAnswers200WithDefaults() throws Exception {
        when(preferences.getPreferences(eq(6L)))
                .thenReturn(new PreferenceResponse(6L, null, AlertChannel.EMAIL));

        mvc.perform(get("/api/v1/preferences/me").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(6))
                .andExpect(jsonPath("$.alertChannel").value("EMAIL"));
    }

    @Test
    void updateMyPreferencesAnswers200() throws Exception {
        when(preferences.updatePreferences(eq(6L), any()))
                .thenReturn(new PreferenceResponse(6L, 6L, AlertChannel.SMS));

        mvc.perform(put("/api/v1/preferences/me")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"defaultAccountId\":6,\"alertChannel\":\"SMS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultAccountId").value(6))
                .andExpect(jsonPath("$.alertChannel").value("SMS"));
    }

    @Test
    void updateWithBadChannelIsVal422Envelope() throws Exception {
        mvc.perform(put("/api/v1/preferences/me")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertChannel\":\"PIGEON\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        verifyNoInteractions(preferences);
    }

    @Test
    void missingTokenIsAuth401Envelope() throws Exception {
        doAnswer(invocation -> {
            throw new UnauthorisedException();
        }).when(authService).authenticatedAccountId(any(HttpServletRequest.class));

        mvc.perform(get("/api/v1/preferences/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        verifyNoInteractions(preferences);
    }
}
