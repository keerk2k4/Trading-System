package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import com.tradingsystem.spring_boot_app.service.InternalAccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Optional;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract tests for the internal account routes.
 *
 * <p>These tests cover routing, validation, delegation, and error translation.
 * They do not define or approve the routes' access-control policy: production
 * currently documents that shared-secret or network-level protection is still
 * missing, so a successful MVC request here is not evidence that the endpoint
 * is safe to expose.
 */
@WebMvcTest(InternalAccountController.class)
class InternalAccountControllerTest {

    private static final String USER_ID = "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private InternalAccountService internalAccounts;

        @MockitoBean
        private JwtTokenProvider tokenProvider;

        @BeforeEach
        void configureTokenValidation() {
                when(tokenProvider.validateInternalServiceToken("internal-token")).thenReturn(true);
        }

    @Test
    void createAccountAnswers201AndReturnsCreatedAccount() throws Exception {
        InternalAccountResponse created = new InternalAccountResponse(
                17L, "ACC-1750000000000", BigDecimal.ZERO, "PENDING");
        when(internalAccounts.createAccountForUser(USER_ID)).thenReturn(created);

        mvc.perform(post("/internal/accounts")
                        .header("Authorization", "Bearer internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"%s\"}".formatted(USER_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accountId").value(17))
                .andExpect(jsonPath("$.accountNumber").value("ACC-1750000000000"))
                .andExpect(jsonPath("$.availableBalance").value(0))
                .andExpect(jsonPath("$.accountStatus").value("PENDING"));

        verify(internalAccounts).createAccountForUser(USER_ID);
    }

    @Test
    void createAccountRejectsBlankUserIdBeforeCallingService() throws Exception {
        mvc.perform(post("/internal/accounts")
                        .header("Authorization", "Bearer internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"   \"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"))
                .andExpect(jsonPath("$.message").value("Invalid input"));

        verifyNoInteractions(internalAccounts);
    }

    @Test
    void createAccountRejectsMalformedJsonBeforeCallingService() throws Exception {
        mvc.perform(post("/internal/accounts")
                        .header("Authorization", "Bearer internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));

        verifyNoInteractions(internalAccounts);
    }

    @Test
    void getAccountByUserAnswers200WithCurrentInternalAccount() throws Exception {
        when(internalAccounts.findAccountByUserId(USER_ID)).thenReturn(Optional.of(
                new InternalAccountResponse(23L, "ACC-current", new BigDecimal("125.50"), "SUSPENDED")));

        mvc.perform(get("/internal/accounts/by-user/{userId}", USER_ID)
                        .header("Authorization", "Bearer internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(23))
                .andExpect(jsonPath("$.accountNumber").value("ACC-current"))
                .andExpect(jsonPath("$.availableBalance").value(125.50))
                .andExpect(jsonPath("$.accountStatus").value("SUSPENDED"));
    }

    @Test
    void getAccountByUserAnswers404WhenNoAccountExists() throws Exception {
        when(internalAccounts.findAccountByUserId(USER_ID)).thenReturn(Optional.empty());

        mvc.perform(get("/internal/accounts/by-user/{userId}", USER_ID)
                        .header("Authorization", "Bearer internal-token"))
                .andExpect(status().isNotFound());
    }

    @Test
    void activateAccountAnswers200WithActiveStatus() throws Exception {
        when(internalAccounts.activateAccountForUser(USER_ID)).thenReturn(
                new InternalAccountResponse(23L, "ACC-current", new BigDecimal("125.50"), "ACTIVE"));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch("/internal/accounts/by-user/{userId}/activate", USER_ID)
                        .header("Authorization", "Bearer internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountStatus").value("ACTIVE"));

        verify(internalAccounts).activateAccountForUser(USER_ID);
    }

    @Test
    void unexpectedServiceFailureIsReturnedAsSafeErrorEnvelope() throws Exception {
        when(internalAccounts.createAccountForUser(USER_ID))
                .thenThrow(new IllegalArgumentException("sensitive backend detail"));

        mvc.perform(post("/internal/accounts")
                        .header("Authorization", "Bearer internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"%s\"}".formatted(USER_ID)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.errorCode").value("ERR-500"))
                .andExpect(jsonPath("$.message").value("Internal server error"))
                .andExpect(content().string(not(containsString("sensitive backend detail"))));
    }
}
