package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record OrderHistoryEntry(String orderId, Long accountId, String symbol,
                                OrderSide side, int quantity, BigDecimal price,
                                BigDecimal executedPrice, OrderStatus status,
                                String idempotencyKey, OffsetDateTime createdOn) {
}
