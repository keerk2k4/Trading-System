package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.CreateStrategyRequest;
import com.tradingsystem.spring_boot_app.dto.StrategyPreferenceResponse;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.StrategyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Strategies", description = "Quote-triggered MARKET-order strategies for the signed-in customer")
@RequestMapping("/api/v1/strategies")
@Validated
public class StrategyController {

    private final StrategyService strategies;
    private final AuthService authService;

    public StrategyController(StrategyService strategies, AuthService authService) {
        this.strategies = strategies;
        this.authService = authService;
    }

    @Operation(summary = "Create a strategy that triggers a MARKET order when quote threshold is reached")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<StrategyPreferenceResponse> create(
            @Valid @RequestBody CreateStrategyRequest body,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(strategies.create(accountId, body));
    }

    @Operation(summary = "List my strategy triggers")
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<StrategyPreferenceResponse>> list(HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(strategies.list(accountId));
    }

    @Operation(summary = "Cancel a strategy trigger")
    @DeleteMapping("/{strategyId}")
    public ResponseEntity<Void> cancel(
            @PathVariable("strategyId") @Min(1) long strategyId,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        strategies.cancel(accountId, strategyId);
        return ResponseEntity.noContent().build();
    }
}
