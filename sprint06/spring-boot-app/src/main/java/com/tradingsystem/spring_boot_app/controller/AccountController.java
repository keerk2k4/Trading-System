package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.spring_boot_app.dto.AccountResponse;
import com.tradingsystem.spring_boot_app.dto.BalanceResponse;
import com.tradingsystem.spring_boot_app.dto.OrderHistoryEntry;
import com.tradingsystem.spring_boot_app.dto.PositionResponse;
import com.tradingsystem.spring_boot_app.service.AccountService;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;


@RestController
@RequestMapping("/api/v1/accounts")
@Validated
public class AccountController {

    private final AccountService accounts;

    public AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccountResponse> getAccount(
            @PathVariable("id") @Min(1) long id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Authorization.requireBearerToken(authorization);
        return ResponseEntity.ok(accounts.getAccount(id));
    }

    @GetMapping(value = "/{id}/balance", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<BalanceResponse> getBalance(
            @PathVariable("id") @Min(1) long id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Authorization.requireBearerToken(authorization);
        return ResponseEntity.ok(accounts.getBalance(id));
    }

    @GetMapping(value = "/{id}/positions", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<PositionResponse>> getPositions(
            @PathVariable("id") @Min(1) long id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Authorization.requireBearerToken(authorization);
        return ResponseEntity.ok(accounts.getPositions(id));
    }

    @GetMapping(value = "/{id}/orders", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<OrderHistoryEntry>> getOrders(
            @PathVariable("id") @Min(1) long id,
            @RequestParam(value = "status", required = false) OrderStatus status,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Authorization.requireBearerToken(authorization);
        return ResponseEntity.ok(accounts.getOrders(id, status, from, to));
    }
}
