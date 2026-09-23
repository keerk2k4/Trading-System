package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.service.OrderService;
import com.tradingsystem.spring_boot_app.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@Validated
public class OrderController {

    private final OrderService orders;
    private final AuthService authService;

    public OrderController(OrderService orders, AuthService authService) {
        this.orders = orders;
        this.authService = authService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> placeOrder(
            @Valid @RequestBody PlaceOrderRequest body,
            HttpServletRequest request) {
        authService.verifyAccountAccess(request, body.getAccountId());  // Verify access before processing
        OrderResponse order = orders.placeOrder(body);                   // Throws 404 if account not found, other errors
        return ResponseEntity.ok(order);
    }

    @DeleteMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> cancelOrder(
            @PathVariable("id") String id,
            HttpServletRequest request) {
        authService.requireBearerToken(request);
        return ResponseEntity.ok(orders.cancelOrder(normaliseOrderId(id)));
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

