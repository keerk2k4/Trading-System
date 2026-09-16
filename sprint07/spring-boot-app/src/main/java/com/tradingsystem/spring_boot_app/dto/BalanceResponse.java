package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record BalanceResponse(Long accountId, BigDecimal cashBalance,
                              String currency, OffsetDateTime asOf) {
}
