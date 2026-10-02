package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;

public record WatchlistStockResponse(String symbol, String name, BigDecimal price,
                                     BigDecimal change, BigDecimal changePercent) {
}
