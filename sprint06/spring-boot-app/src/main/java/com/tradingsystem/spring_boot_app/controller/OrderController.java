package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.exception.InvalidOrderArgumentException;
// import com.tradingsystem.spring_boot_app.dto.OrderResponse;
// import com.tradingsystem.spring_boot_app.dto.PlaceOrderRequest;
// import com.tradingsystem.spring_boot_app.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/orders")
@Validated
public class OrderController {

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> placeOrder(
            @Valid @RequestBody PlaceOrderRequest body,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Authorization.requireBearerToken(authorization);
        return ResponseEntity.ok(orders.placeOrder(body));
    }

    @DeleteMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderResponse> cancelOrder(
            @PathVariable("id") String id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Authorization.requireBearerToken(authorization);
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
            throw new InvalidOrderArgumentException("id", id);
        }
    }
}
