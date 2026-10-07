package com.tradingsystem.spring_boot_app.portfolio.dto;

import java.time.OffsetDateTime;
import java.util.List;

/** GET /health: status is ok or degraded; a failing dependency never fails the response. */
public record PortfolioHealthResponse(String status, List<Dependency> dependencies, OffsetDateTime asOf) {

    /** status is ok, degraded or down; quotaRemaining is for fauxnance only. */
    public record Dependency(String name, String status, Integer quotaRemaining) {
    }
}
