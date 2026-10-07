package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One strategy trigger owned by the signed-in customer.
 */
public record StrategyPreferenceResponse(
        Long strategyId,
        String symbol,
        OrderSide side,
        BigDecimal targetPrice,
        Integer quantity,
        String status,
        String triggeredOrderId,
        OffsetDateTime createdOn,
        OffsetDateTime triggeredOn
) {
}
