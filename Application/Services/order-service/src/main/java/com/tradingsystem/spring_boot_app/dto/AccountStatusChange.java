package com.tradingsystem.spring_boot_app.dto;

import java.time.LocalDateTime;

/**
 * One entry of an account's status history (trading.account_status_changes).
 *
 * @param changedBy the admin's Auth user id, from their token's {@code sub}
 */
public record AccountStatusChange(
        String fromStatus,
        String toStatus,
        String reason,
        String changedBy,
        LocalDateTime changedAt) {
}
