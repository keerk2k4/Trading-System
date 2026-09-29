package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;

public record PositionResponse(Long accountId, String symbol, int quantity,
                               BigDecimal averageCost) {
}
