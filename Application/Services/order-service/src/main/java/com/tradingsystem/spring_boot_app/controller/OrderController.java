package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.dto.CreateOrderRequest;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.dto.UpdateOrderRequest;
import com.tradingsystem.spring_boot_app.service.OrderService;
import com.tradingsystem.spring_boot_app.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@Tag(name = "Orders", description = "Place and cancel limit orders")
@RequestMapping("/api/v1/orders")
@Validated
public class OrderController {

    private final OrderService orders;
    private final AuthService authService;

    public OrderController(OrderService orders, AuthService authService) {
        this.orders = orders;
        this.authService = authService;
    }

    @Operation(summary = "Place a limit order for the signed-in trader's account")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> placeOrder(
            @Valid @RequestBody CreateOrderRequest body,
            HttpServletRequest request) {
        body.validateForCreate();
        long accountId = authService.authenticatedAccountId(request);
        PlaceOrderRequest orderRequest = new PlaceOrderRequest(
            accountId,
            body.getOrderType(),
            body.getSymbol(),
            body.getSide(),
            body.getQuantity(),
            body.getPrice(),
            body.getIdempotencyKey());
        OrderResponse order = orders.placeOrder(orderRequest);            // Throws 404 if account not found, other errors
        return ResponseEntity.ok(order);
    }

    @Operation(summary = "Cancel an order that has not yet been filled")
    @DeleteMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> cancelOrder(
            @PathVariable("id") String id,
            HttpServletRequest request) {
        authService.requireBearerToken(request);
        return ResponseEntity.ok(orders.cancelOrder(normaliseOrderId(id)));
    }

    @Operation(summary = "Update quantity and/or limit price of a working order")
    @PatchMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> updateOrder(
            @PathVariable("id") String id,
            @Valid @RequestBody UpdateOrderRequest body,
            HttpServletRequest request) {
        authService.requireBearerToken(request);
        body.validateForUpdate(null);
        return ResponseEntity.ok(orders.updateOrder(normaliseOrderId(id), body.getQuantity(), body.getPrice()));
    }

    private String normaliseOrderId(String id) {
        String raw = id == null ? "" : id.trim();
        if (raw.regionMatches(true, 0, "ORD-", 0, 4)) {
            raw = raw.substring(4);
        }
        try {
            return UUID.fromString(raw).toString();
        } catch (IllegalArgumentException ex) {
            try {
                return Long.toString(Long.parseLong(raw));
            } catch (NumberFormatException numberFormatException) {
                throw new InvalidOrderArgumentException("id", id);
            }
        }
    }
}

