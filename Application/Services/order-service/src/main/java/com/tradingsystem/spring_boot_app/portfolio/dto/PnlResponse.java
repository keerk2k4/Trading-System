package com.tradingsystem.spring_boot_app.portfolio.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * GET /api/v1/portfolio/{accountId}/pnl. from and to bound the realised
 * figure only; unrealised is always as at asOf. bySymbol is left out of the
 * JSON unless it was asked for.
 */
public record PnlResponse(long accountId, String baseCurrency, LocalDate from, LocalDate to,
                          BigDecimal realisedPnl, BigDecimal unrealisedPnl, BigDecimal totalPnl,
                          @JsonInclude(JsonInclude.Include.NON_NULL) List<SymbolPnl> bySymbol,
                          OffsetDateTime asOf) {
}
