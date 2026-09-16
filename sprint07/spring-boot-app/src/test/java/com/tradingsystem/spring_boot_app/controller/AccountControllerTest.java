package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.spring_boot_app.dto.AccountResponse;
import com.tradingsystem.spring_boot_app.dto.AccountStatus;
import com.tradingsystem.spring_boot_app.dto.BalanceResponse;
import com.tradingsystem.spring_boot_app.dto.OrderHistoryEntry;
import com.tradingsystem.spring_boot_app.dto.PositionResponse;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.service.AccountService;
import com.tradingsystem.spring_boot_app.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AccountController.class)
class AccountControllerTest {

    private static final String TOKEN = "Bearer test-token";
    private static final String UUID = "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e";
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-09-28T09:14:22Z");

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AccountService accounts;

    @MockitoBean
    private AuthService authService;

    @BeforeEach
    void mockAuthGuard() {
        doAnswer(invocation -> {
            HttpServletRequest request = invocation.getArgument(0);
            String authorization = request.getHeader("Authorization");
            if (authorization == null || authorization.isBlank()
                    || !authorization.startsWith("Bearer ")
                    || authorization.substring("Bearer ".length()).isBlank()) {
                throw new UnauthorisedException();
            }
            return null;
        }).when(authService).verifyAccountAccess(any(HttpServletRequest.class), anyLong());
    }

    @Test
    void getAccountAnswers200WithBusinessReferenceAccountId() throws Exception {
        when(accounts.getAccount(eq(1L))).thenReturn(new AccountResponse(1L, "ACC-000001",
                "Priya Menon", new BigDecimal("24500.75"), AccountStatus.ACTIVE, 7, NOW));

        mvc.perform(get("/api/v1/accounts/{id}", 1).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.accountId").value("ACC-000001"))
                .andExpect(jsonPath("$.holderName").value("Priya Menon"))
                .andExpect(jsonPath("$.cashBalance").value(24500.75))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(7))
                .andExpect(jsonPath("$.lastUpdated").value("2026-09-28T09:14:22Z"));
    }

    @Test
    void getBalanceAnswers200WithContractBody() throws Exception {
        when(accounts.getBalance(eq(1L))).thenReturn(new BalanceResponse(1L,
                new BigDecimal("24500.75"), "USD", NOW));

        mvc.perform(get("/api/v1/accounts/{id}/balance", 1).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(1))
                .andExpect(jsonPath("$.cashBalance").value(24500.75))
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.asOf").value("2026-09-28T09:14:22Z"));
    }

    @Test
    void getPositionsAnswers200WithContractBody() throws Exception {
        when(accounts.getPositions(eq(1L))).thenReturn(List.of(
                new PositionResponse(1L, "ACME", 100, new BigDecimal("25.50")),
                new PositionResponse(1L, "INFY.NS", 40, new BigDecimal("1580.25"))));

        mvc.perform(get("/api/v1/accounts/{id}/positions", 1).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountId").value(1))
                .andExpect(jsonPath("$[0].symbol").value("ACME"))
                .andExpect(jsonPath("$[0].quantity").value(100))
                .andExpect(jsonPath("$[0].averageCost").value(25.50))
                .andExpect(jsonPath("$[1].symbol").value("INFY.NS"));
    }

    @Test
    void getOrdersAnswers200WithContractBody() throws Exception {
        when(accounts.getOrders(eq(1L), any(), any(), any())).thenReturn(List.of(
                new OrderHistoryEntry("ORD-" + UUID, 1L, "ACME", OrderSide.BUY, 100,
                        new BigDecimal("25.50"), new BigDecimal("25.48"), OrderStatus.FILLED,
                        UUID, NOW)));

        mvc.perform(get("/api/v1/accounts/{id}/orders", 1)
                        .header("Authorization", TOKEN)
                        .queryParam("status", "FILLED")
                        .queryParam("from", "2026-09-01T00:00:00Z")
                        .queryParam("to", "2026-09-30T00:00:00Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].orderId").value("ORD-" + UUID))
                .andExpect(jsonPath("$[0].accountId").value(1))
                .andExpect(jsonPath("$[0].symbol").value("ACME"))
                .andExpect(jsonPath("$[0].side").value("BUY"))
                .andExpect(jsonPath("$[0].quantity").value(100))
                .andExpect(jsonPath("$[0].price").value(25.50))
                .andExpect(jsonPath("$[0].executedPrice").value(25.48))
                .andExpect(jsonPath("$[0].status").value("FILLED"))
                .andExpect(jsonPath("$[0].idempotencyKey").value(UUID))
                .andExpect(jsonPath("$[0].createdOn").value("2026-09-28T09:14:22Z"));
    }

    @Test
    void accountReadsWithoutTokenAreAuth401Envelope() throws Exception {
        mvc.perform(get("/api/v1/accounts/{id}", 1))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"))
                .andExpect(jsonPath("$.message").value("Unauthorised"));
        mvc.perform(get("/api/v1/accounts/{id}/balance", 1))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        mvc.perform(get("/api/v1/accounts/{id}/positions", 1))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        mvc.perform(get("/api/v1/accounts/{id}/orders", 1))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        verifyNoInteractions(accounts);
    }

    @Test
    void unknownAccountIsAcc404Envelope() throws Exception {
        when(accounts.getAccount(eq(9L))).thenThrow(new AccountNotFoundException(9L));

        mvc.perform(get("/api/v1/accounts/{id}", 9).header("Authorization", TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"))
                .andExpect(jsonPath("$.message").value("Account not found"));
    }

    @Test
    void inactiveAccountIsAcc403Envelope() throws Exception {
        when(accounts.getBalance(eq(1L))).thenThrow(new AccountNotActiveException(1L));

        mvc.perform(get("/api/v1/accounts/{id}/balance", 1).header("Authorization", TOKEN))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"))
                .andExpect(jsonPath("$.message").value("Account not active"));
    }

    @Test
    void invalidAccountIdsAreVal422Envelope() throws Exception {
        mvc.perform(get("/api/v1/accounts/{id}", 0).header("Authorization", TOKEN))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        mvc.perform(get("/api/v1/accounts/{id}", "abc").header("Authorization", TOKEN))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        verifyNoInteractions(accounts);
    }

    @Test
    void invalidOrderStatusFilterIsVal422Envelope() throws Exception {
        mvc.perform(get("/api/v1/accounts/{id}/orders", 1)
                        .header("Authorization", TOKEN)
                        .queryParam("status", "BOGUS"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        verifyNoInteractions(accounts);
    }

    @Test
    void unknownPathIsEnvelopeNotWhitelabel() throws Exception {
        mvc.perform(get("/api/v1/no-such-route").header("Authorization", TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").exists())
                .andExpect(jsonPath("$.message").exists());
    }
}
