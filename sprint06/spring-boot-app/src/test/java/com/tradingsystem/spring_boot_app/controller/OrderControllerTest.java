package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.DuplicateOrderException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InstrumentDelistedException;
import com.tradingsystem.exception.InstrumentNotFoundException;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.exception.OrderNotFoundException;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.OrderService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderController.class)
class OrderControllerTest {

    private static final String TOKEN = "Bearer test-token";
    private static final String UUID = "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e";

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
        }).when(authService).verifyAccountAccess(any(HttpServletRequest.class), anyLong());

        doAnswer(invocation -> {
            HttpServletRequest request = invocation.getArgument(0);
            String authorization = request.getHeader("Authorization");
            if (authorization == null || authorization.isBlank()
                    || !authorization.startsWith("Bearer ")
                    || authorization.substring("Bearer ".length()).isBlank()) {
                throw new UnauthorisedException();
            }
            return null;
        }).when(authService).requireBearerToken(any(HttpServletRequest.class));
    }

    private static String validBody() {
        return """
                {"accountId":1,"symbol":"ACME","side":"BUY","quantity":100,\
                "price":25.50,"idempotencyKey":"%s"}""".formatted(UUID);
    }

    private static OrderResponse filled() {
        return new OrderResponse("ORD-" + UUID, OrderStatus.FILLED, "Order executed",
                "ACME", OrderSide.BUY, 100, new BigDecimal("25.50"));
    }

    @Test
    void placeOrderAnswers200WithContractBody() throws Exception {
        when(orders.placeOrder(any())).thenReturn(filled());

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value("ORD-" + UUID))
                .andExpect(jsonPath("$.status").value("FILLED"))
                .andExpect(jsonPath("$.message").value("Order executed"))
                .andExpect(jsonPath("$.symbol").value("ACME"))
                .andExpect(jsonPath("$.side").value("BUY"))
                .andExpect(jsonPath("$.quantity").value(100))
                .andExpect(jsonPath("$.price").value(25.50));
    }

    @Test
    void placeOrderWithoutTokenIsAuth401Envelope() throws Exception {
        mvc.perform(post("/api/v1/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"))
                .andExpect(jsonPath("$.message").value("Unauthorised"));
        verifyNoInteractions(orders);
    }

    @Test
    void placeOrderWithMalformedTokenIsAuth401Envelope() throws Exception {
        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Token abc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        verifyNoInteractions(orders);
    }

    @Test
    void placeOrderWithInvalidBodyIsVal422Envelope() throws Exception {
        String body = """
                {"accountId":1,"symbol":"ACME","side":"BUY","quantity":0,\
                "price":0,"idempotencyKey":"short"}""";

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"))
                .andExpect(jsonPath("$.message").value("Invalid input"));
        verifyNoInteractions(orders);
    }

    @Test
    void placeOrderWithUnknownPropertyIsVal422Envelope() throws Exception {
        String body = validBody().replace("}", ",\"extra\":1}");

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        verifyNoInteractions(orders);
    }

    @Test
    void placeOrderMapsBusinessFailuresToContractEnvelopes() throws Exception {
        assertPlaceFailure(new AccountNotFoundException(9), 404, "ACC-404", "Account not found");
        assertPlaceFailure(new AccountNotActiveException(1), 403, "ACC-403", "Account not active");
        assertPlaceFailure(new InstrumentNotFoundException("NOPE"), 404, "INS-404", "Instrument not found");
        assertPlaceFailure(new InstrumentDelistedException("ACME"), 404, "INS-404", "Instrument not found");
        assertPlaceFailure(new InsufficientFundsException(new BigDecimal("2550.00"), BigDecimal.ZERO),
                400, "ORD-400", "Insufficient funds");
        assertPlaceFailure(new InsufficientHoldingsException(100, 40),
                409, "ORD-409", "Insufficient holdings");
        assertPlaceFailure(new DuplicateOrderException(UUID), 409, "ORD-409", "Duplicate order");
        assertPlaceFailure(new InvalidOrderArgumentException("Quantity"),
                422, "VAL-422", "Invalid input");
    }

    private void assertPlaceFailure(RuntimeException failure, int http,
                                    String code, String message) throws Exception {
        org.mockito.Mockito.doThrow(failure).when(orders).placeOrder(any());

        mvc.perform(post("/api/v1/orders")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().is(http))
                .andExpect(jsonPath("$.errorCode").value(code))
                .andExpect(jsonPath("$.message").value(message));
    }

    @Test
    void cancelOrderAnswers200WithContractBody() throws Exception {
        OrderResponse cancelled = new OrderResponse("ORD-" + UUID, OrderStatus.CANCELLED,
                "Order cancelled", "ACME", OrderSide.BUY, 100, new BigDecimal("25.50"));
        when(orders.cancelOrder(eq(UUID))).thenReturn(cancelled);

        mvc.perform(delete("/api/v1/orders/{id}", UUID).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value("ORD-" + UUID))
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.message").value("Order cancelled"));
    }

    @Test
    void cancelOrderToleratesOrdPrefix() throws Exception {
        OrderResponse cancelled = new OrderResponse("ORD-" + UUID, OrderStatus.CANCELLED,
                "Order cancelled", "ACME", OrderSide.BUY, 100, new BigDecimal("25.50"));
        when(orders.cancelOrder(eq(UUID))).thenReturn(cancelled);

        mvc.perform(delete("/api/v1/orders/{id}", "ORD-" + UUID).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void cancelOrderWithMalformedIdIsVal422Envelope() throws Exception {
        mvc.perform(delete("/api/v1/orders/{id}", "not-a-uuid").header("Authorization", TOKEN))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        verifyNoInteractions(orders);
    }

    @Test
    void cancelOrderWithoutTokenIsAuth401Envelope() throws Exception {
        mvc.perform(delete("/api/v1/orders/{id}", UUID))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
        verifyNoInteractions(orders);
    }

    @Test
    void cancelOrderUnknownIdIs404WithOrd409Code() throws Exception {
        when(orders.cancelOrder(eq(UUID))).thenThrow(new OrderNotFoundException(UUID));

        mvc.perform(delete("/api/v1/orders/{id}", UUID).header("Authorization", TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ORD-409"))
                .andExpect(jsonPath("$.message").value("Order not found"));
    }

    @Test
    void cancelOrderTerminalStateIsOrd409Envelope() throws Exception {
        when(orders.cancelOrder(eq(UUID))).thenThrow(new IllegalStateException("already terminal"));

        mvc.perform(delete("/api/v1/orders/{id}", UUID).header("Authorization", TOKEN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ORD-409"))
                .andExpect(jsonPath("$.message").value("Order is not cancellable"));
    }
}
