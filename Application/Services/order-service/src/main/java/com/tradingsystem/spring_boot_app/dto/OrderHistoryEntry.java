package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * realizedPnl / realizedPnlPercent are set only for FILLED SELL orders with a
 * known average cost (recorded by the executor at settlement); null otherwise.
 */
public record OrderHistoryEntry(String orderId, Long accountId, String symbol,
                                OrderSide side, OrderType orderType, int quantity, BigDecimal price,
                                BigDecimal executedPrice, OrderStatus status,
                                String idempotencyKey, OffsetDateTime createdOn,
                                BigDecimal realizedPnl, BigDecimal realizedPnlPercent) {
    public OrderHistoryEntry(String orderId, Long accountId, String symbol,
                             OrderSide side, int quantity, BigDecimal price,
                             BigDecimal executedPrice, OrderStatus status,
                             String idempotencyKey, OffsetDateTime createdOn) {
        this(orderId, accountId, symbol, side, OrderType.LIMIT, quantity, price, executedPrice, status,
                idempotencyKey, createdOn, null, null);
    }
}
