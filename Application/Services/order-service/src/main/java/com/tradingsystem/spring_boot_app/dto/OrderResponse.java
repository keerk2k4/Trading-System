package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;

import java.math.BigDecimal;

public record OrderResponse(String orderId, OrderStatus status, String message,
                            String symbol, OrderSide side, int quantity,
                            BigDecimal price, OrderType orderType) {
    public OrderResponse(String orderId, OrderStatus status, String message,
                         String symbol, OrderSide side, int quantity,
                         BigDecimal price) {
        this(orderId, status, message, symbol, side, quantity, price, OrderType.LIMIT);
    }
}
