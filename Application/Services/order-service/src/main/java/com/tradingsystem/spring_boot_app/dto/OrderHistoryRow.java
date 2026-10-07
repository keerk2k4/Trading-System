package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Internal read-model row for order history projections.
 */
public record OrderHistoryRow(
        String orderId,
        Long accountId,
        String symbol,
        OrderSide side,
        OrderType orderType,
        int quantity,
        BigDecimal price,
        BigDecimal executedPrice,
        OrderStatus status,
        String idempotencyKey,
        LocalDateTime createdOn,
        BigDecimal realizedPnl,
        BigDecimal realizedPnlPercent
) {
}
