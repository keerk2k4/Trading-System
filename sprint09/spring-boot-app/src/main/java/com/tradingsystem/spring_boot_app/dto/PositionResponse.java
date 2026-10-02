package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;

public record PositionResponse(Long accountId, String symbol, int quantity,
                               BigDecimal averageCost, BigDecimal currentPrice,
                               BigDecimal marketValue) {
    public PositionResponse(Long accountId, String symbol, int quantity, BigDecimal averageCost) {
        this(accountId, symbol, quantity, averageCost, null, null);
    }
}
