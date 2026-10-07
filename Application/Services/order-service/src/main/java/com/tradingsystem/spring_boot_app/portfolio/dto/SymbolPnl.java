package com.tradingsystem.spring_boot_app.portfolio.dto;

import java.math.BigDecimal;

public record SymbolPnl(String symbol, BigDecimal realisedPnl, BigDecimal unrealisedPnl, BigDecimal totalPnl) {
}
