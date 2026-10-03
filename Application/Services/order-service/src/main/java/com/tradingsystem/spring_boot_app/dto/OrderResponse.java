package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;

import java.math.BigDecimal;

public record OrderResponse(String orderId, OrderStatus status, String message,
                            String symbol, OrderSide side, int quantity,
                            BigDecimal price) {
}
