package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;

/**
 * GET /api/v1/instruments/{symbol}/quote response: the latest cached
 * market-data quote. Contract QuoteResponse. Null bid/ask means no executable
 * quote yet, so a MARKET order would be rejected.
 */
public record QuoteResponse(String symbol, BigDecimal price, BigDecimal bid, BigDecimal ask,
                             String currency, BigDecimal change, BigDecimal changePercent) {
}
