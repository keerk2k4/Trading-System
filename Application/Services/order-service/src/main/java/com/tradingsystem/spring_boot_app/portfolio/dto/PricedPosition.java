package com.tradingsystem.spring_boot_app.portfolio.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One open holding, priced. lastPrice, marketValue, unrealisedPnl,
 * unrealisedPnlPercent and priceAsOf are null, and stale is true, when the
 * instrument could not be priced.
 */
public record PricedPosition(long accountId, String symbol, int quantity,
                             BigDecimal averageCost, BigDecimal costBasis,
                             BigDecimal lastPrice, BigDecimal marketValue,
                             BigDecimal unrealisedPnl, BigDecimal unrealisedPnlPercent,
                             String currency, OffsetDateTime priceAsOf, boolean stale) {

    @JsonIgnore
    public boolean priced() {
        return lastPrice != null;
    }
}
