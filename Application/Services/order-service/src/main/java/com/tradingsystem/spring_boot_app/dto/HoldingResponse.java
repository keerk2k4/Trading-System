package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;

/**
 * Settled (demat) holdings per instrument. Same enrichment as positions:
 * unrealizedPnl = (currentPrice - averageCost) x quantity, null like
 * currentPrice until a quote has been seen.
 */
public record HoldingResponse(Long accountId, String symbol, int quantity,
                              BigDecimal averageCost, BigDecimal currentPrice,
                              BigDecimal marketValue, BigDecimal unrealizedPnl,
                              BigDecimal unrealizedPnlPercent) {
    public HoldingResponse(Long accountId, String symbol, int quantity, BigDecimal averageCost) {
        this(accountId, symbol, quantity, averageCost, null, null, null, null);
    }
}
