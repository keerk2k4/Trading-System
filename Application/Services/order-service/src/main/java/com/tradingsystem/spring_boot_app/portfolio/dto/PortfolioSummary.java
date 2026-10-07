package com.tradingsystem.spring_boot_app.portfolio.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * GET /api/v1/portfolio/{accountId}, as fixed by contracts/portfolio-api.yaml.
 * marketValue, unrealisedPnl and totalValue cover the priced holdings only;
 * {@code partial} is true when at least one holding could not be priced.
 */
public record PortfolioSummary(long accountId, String baseCurrency, BigDecimal cashBalance,
                               BigDecimal marketValue, BigDecimal costBasis,
                               BigDecimal unrealisedPnl, BigDecimal unrealisedPnlPercent,
                               BigDecimal realisedPnl, BigDecimal totalValue,
                               int positionCount, boolean partial, OffsetDateTime asOf) {
}
