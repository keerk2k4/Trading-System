package com.tradingsystem.spring_boot_app.dto;

import java.time.Instant;
import java.util.List;

/**
 * Admin view of the platform's health, as seen from the Trade API.
 *
 * @param overall   UP when every service is UP, otherwise DEGRADED
 * @param checkedAt when the checks ran (answers are reused for a few seconds)
 * @param services  the Trade API (with its database), Kafka and the Trade Executor
 */
public record AdminHealthResponse(String overall, Instant checkedAt, List<ServiceHealth> services) {

    /**
     * @param status     UP; DEGRADED (running, but a dependency is failing); DOWN (no answer);
     *                   or UNKNOWN (could not be asked, or the answer was unreadable)
     * @param responseMs how long the check took, or null when it got no answer
     * @param detail     a fixed sentence for a person to read; never an exception text
     */
    public record ServiceHealth(String name, String status, Long responseMs, String detail) {
    }
}
