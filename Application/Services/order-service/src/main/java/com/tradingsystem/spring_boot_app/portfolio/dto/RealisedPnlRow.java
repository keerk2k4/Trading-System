package com.tradingsystem.spring_boot_app.portfolio.dto;

import java.math.BigDecimal;

/** Realised profit and loss booked on one instrument's filled sells. */
public record RealisedPnlRow(String symbol, BigDecimal realisedPnl) {
}
