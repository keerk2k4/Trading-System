package com.tradingsystem.spring_boot_app.characterisation;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.DuplicateOrderException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InstrumentDelistedException;
import com.tradingsystem.exception.InstrumentNotFoundException;
import com.tradingsystem.spring_boot_app.controller.OrderController;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.OrderService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Characterisation tests for the Sprint 6 order placement path, HTTP edge.
 *
 * <p>These tests record what {@code POST /api/v1/orders} does <em>now</em>,
 * before the Sprint 7 change (record at {@code NEW}, publish to {@code orders}).
 * They assert current behaviour, including the parts we disagree with:
 *
 * <ul>
 *   <li>An affordable order is filled synchronously and answers {@code FILLED},
 *       not {@code NEW}. Sprint 7 will deliberately change this to {@code NEW}.</li>
 *   <li>A delisted instrument is reported with the same {@code INS-404} /
 *       "Instrument not found" envelope as an unknown symbol, so the two cases
 *       are indistinguishable at the edge.</li>
 * </ul>
 */
@WebMvcTest(OrderController.class)
class OrderPlacementCharacterisationTest {

    private static final String TOKEN = "Bearer test-token";
    private static final String KEY = "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private OrderService orders;

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
        }).when(authService).verifyAccountAccess(any(HttpServletRequest.class), any(Long.class));
    }

    private static String validBody() {
        return """
                {"accountId":1,"symbol":"ACME","side":"BUY","quantity":10,\
                "price":25.50,"idempotencyKey":"%s"}""".formatted(KEY);
    }

    @Test
    @DisplayName("affordable BUY answers 200 with every response field pinned, including FILLED")
    void affordableOrderFieldByField() throws Exception {
        when(orders.placeOrder(any())).thenReturn(new OrderResponse(
                "ORD-7", OrderStatus.FILLED, "Order executed",
                "ACME", OrderSide.BUY, 10, new BigDecimal("25.50")));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value("ORD-7"))
                .andExpect(jsonPath("$.status").value("FILLED"))
                .andExpect(jsonPath("$.message").value("Order executed"))
                .andExpect(jsonPath("$.symbol").value("ACME"))
                .andExpect(jsonPath("$.side").value("BUY"))
                .andExpect(jsonPath("$.quantity").value(10))
                .andExpect(jsonPath("$.price").value(25.50));
    }

    @Test
    @DisplayName("reused idempotency key maps to 409 ORD-409 Duplicate order")
    void reusedIdempotencyKeyIs409() throws Exception {
        when(orders.placeOrder(any())).thenThrow(new DuplicateOrderException(KEY));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ORD-409"))
                .andExpect(jsonPath("$.message").value("Duplicate order"));
    }

    @Test
    @DisplayName("unaffordable BUY maps to 400 ORD-400 Insufficient funds")
    void unaffordableBuyIs400() throws Exception {
        when(orders.placeOrder(any()))
                .thenThrow(new InsufficientFundsException(new BigDecimal("255.00"), BigDecimal.ZERO));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("ORD-400"))
                .andExpect(jsonPath("$.message").value("Insufficient funds"));
    }

    @Test
    @DisplayName("unknown symbol maps to 404 INS-404 Instrument not found")
    void unknownSymbolIs404() throws Exception {
        when(orders.placeOrder(any())).thenThrow(new InstrumentNotFoundException("NOPE"));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("INS-404"))
                .andExpect(jsonPath("$.message").value("Instrument not found"));
    }

    @Test
    @DisplayName("delisted instrument is conflated with unknown symbol: same 404 INS-404")
    void delistedInstrumentIsConflatedWithUnknownSymbol() throws Exception {
        when(orders.placeOrder(any())).thenThrow(new InstrumentDelistedException("ACME"));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("INS-404"))
                .andExpect(jsonPath("$.message").value("Instrument not found"));
    }

    @Test
    @DisplayName("account that is not ACTIVE maps to 403 ACC-403 Account not active")
    void inactiveAccountIs403() throws Exception {
        when(orders.placeOrder(any())).thenThrow(new AccountNotActiveException(1L));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"))
                .andExpect(jsonPath("$.message").value("Account not active"));
    }

    @Test
    @DisplayName("missing account maps to 404 ACC-404 Account not found")
    void missingAccountIs404() throws Exception {
        when(orders.placeOrder(any())).thenThrow(new AccountNotFoundException(9L));

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"))
                .andExpect(jsonPath("$.message").value("Account not found"));
    }
}
