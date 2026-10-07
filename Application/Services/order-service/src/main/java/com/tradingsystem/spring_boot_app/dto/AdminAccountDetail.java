package com.tradingsystem.spring_boot_app.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * One trading account for the admin detail view: the account, a few figures
 * about its activity, the statuses an admin may move it to next, and its
 * status history, newest first.
 *
 * @param ordersByStatus     order count per status (NEW, FILLED, ...), only statuses that occur
 * @param allowedNextStatuses what PATCH .../status accepts from the current status; empty once CLOSED
 */
public record AdminAccountDetail(
        AdminAccountSummary account,
        long openPositions,
        Map<String, Long> ordersByStatus,
        LocalDateTime lastOrderAt,
        List<String> allowedNextStatuses,
        List<AccountStatusChange> statusHistory) {
}
