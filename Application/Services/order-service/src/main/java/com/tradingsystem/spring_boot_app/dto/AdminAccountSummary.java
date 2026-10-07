package com.tradingsystem.spring_boot_app.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One trading account as the admin account list shows it. The customer's name
 * and username are not here: they live in the Auth service, which the admin
 * screen asks separately by {@code userId}.
 */
public record AdminAccountSummary(
        long id,
        String accountNumber,
        String userId,
        String status,
        BigDecimal cashBalance,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
