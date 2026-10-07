package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.spring_boot_app.portfolio.dto.PnlResponse;
import com.tradingsystem.spring_boot_app.portfolio.dto.PortfolioSummary;
import com.tradingsystem.spring_boot_app.portfolio.dto.PricedPosition;
import com.tradingsystem.spring_boot_app.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Portfolio and P&L routes from contracts/portfolio-api.yaml. Unlike the
 * account routes, the path account is not replaced by the token's: every
 * route compares the two first, and a mismatch is 403 ACC-403, logged.
 */
@RestController
@Tag(name = "Portfolio", description = "Priced holdings and realised and unrealised profit and loss")
@RequestMapping("/api/v1/portfolio")
@Validated
public class PortfolioController {

    private final PortfolioService portfolio;
    private final AuthService authService;

    public PortfolioController(PortfolioService portfolio, AuthService authService) {
        this.portfolio = portfolio;
        this.authService = authService;
    }

    @Operation(summary = "Get the portfolio summary")
    @GetMapping(value = "/{accountId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PortfolioSummary> getPortfolioSummary(
            @PathVariable("accountId") @Min(1) long accountId,
            HttpServletRequest request) {
        authService.verifyAccountAccess(request, accountId);
        return ResponseEntity.ok(portfolio.summary(accountId));
    }

    @Operation(summary = "Get priced positions")
    @GetMapping(value = "/{accountId}/positions", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<PricedPosition>> getPricedPositions(
            @PathVariable("accountId") @Min(1) long accountId,
            @RequestParam(value = "symbol", required = false) @Size(max = 20) String symbol,
            HttpServletRequest request) {
        authService.verifyAccountAccess(request, accountId);
        return ResponseEntity.ok(portfolio.positions(accountId, symbol));
    }

    @Operation(summary = "Get profit and loss")
    @GetMapping(value = "/{accountId}/pnl", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PnlResponse> getPnl(
            @PathVariable("accountId") @Min(1) long accountId,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(value = "bySymbol", required = false, defaultValue = "false") boolean bySymbol,
            HttpServletRequest request) {
        authService.verifyAccountAccess(request, accountId);
        return ResponseEntity.ok(portfolio.pnl(accountId, from, to, bySymbol));
    }
}
