package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.spring_boot_app.portfolio.dto.PortfolioHealthResponse;
import com.tradingsystem.spring_boot_app.portfolio.dto.PortfolioHealthResponse.Dependency;
import com.tradingsystem.spring_boot_app.service.LatestPriceCache;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * GET /health from contracts/portfolio-api.yaml. Outside /api/v1, so no token
 * is needed. Always 200 while this service runs; a failing dependency only
 * degrades {@code status}.
 *
 * <p>This module never calls Fauxnance itself: prices arrive on market-data
 * from the executor's poller. So fauxnance is reported from how recently a
 * quote arrived, and quotaRemaining is null, because asking Fauxnance's
 * /usage would itself cost quota.
 */
@RestController
@Tag(name = "Operations", description = "Liveness")
public class PortfolioHealthController {

    private static final Logger LOGGER = LoggerFactory.getLogger(PortfolioHealthController.class);

    private final PortfolioMapper portfolio;
    private final LatestPriceCache prices;
    private final Duration maxPriceAge;
    private final Clock clock;

    public PortfolioHealthController(PortfolioMapper portfolio, LatestPriceCache prices,
                                     @Value("${portfolio.price.max-age:PT5M}") Duration maxPriceAge) {
        this.portfolio = portfolio;
        this.prices = prices;
        this.maxPriceAge = maxPriceAge;
        this.clock = Clock.systemUTC();
    }

    @Operation(summary = "Liveness and dependency status")
    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PortfolioHealthResponse> getHealth() {
        List<Dependency> dependencies = List.of(postgres(), fauxnance());
        boolean allOk = dependencies.stream().allMatch(d -> "ok".equals(d.status()));
        return ResponseEntity.ok(new PortfolioHealthResponse(allOk ? "ok" : "degraded", dependencies,
                OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC)));
    }

    private Dependency postgres() {
        try {
            portfolio.ping();
            return new Dependency("postgres", "ok", null);
        } catch (RuntimeException e) {
            LOGGER.warn("Portfolio health: database check failed: {}", e.getClass().getSimpleName());
            return new Dependency("postgres", "down", null);
        }
    }

    /** ok: a quote arrived within the freshness window; degraded: only older ones; down: none yet. */
    private Dependency fauxnance() {
        String status = prices.lastReceivedAt()
                .map(last -> last.plus(maxPriceAge).isBefore(Instant.now(clock)) ? "degraded" : "ok")
                .orElse("down");
        return new Dependency("fauxnance", status, null);
    }
}
