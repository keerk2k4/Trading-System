package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record AccountResponse(Long id, String accountId, String holderName,
                              BigDecimal cashBalance, AccountStatus status,
                              long version, OffsetDateTime lastUpdated) {
}
