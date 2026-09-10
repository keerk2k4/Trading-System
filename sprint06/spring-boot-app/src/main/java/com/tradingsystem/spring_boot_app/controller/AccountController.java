package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.spring_boot_app.dto.AccountResponse;
import com.tradingsystem.spring_boot_app.dto.BalanceResponse;
import com.tradingsystem.spring_boot_app.dto.OrderHistoryEntry;
import com.tradingsystem.spring_boot_app.dto.PositionResponse;
import com.tradingsystem.spring_boot_app.service.AccountService;
import com.tradingsystem.spring_boot_app.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final AuthService authService;

    public AccountController(AccountService accounts, AuthService authService) {
        this.accounts = accounts;
        this.authService = authService;
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccountResponse> getAccount(
            @PathVariable("id") @Min(1) long id,
            HttpServletRequest request) {
        AccountResponse account = accounts.getAccount(id);  // Throws 404 if not found
        authService.verifyAccountAccess(request, id);       // Throws 403 if no access
        return ResponseEntity.ok(account);
    }

    @GetMapping(value = "/{id}/balance", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<BalanceResponse> getBalance(
            @PathVariable("id") @Min(1) long id,
            HttpServletRequest request) {
        BalanceResponse balance = accounts.getBalance(id);   // Throws 404 if not found
        authService.verifyAccountAccess(request, id);        // Throws 403 if no access
        return ResponseEntity.ok(balance);
    }

    @GetMapping(value = "/{id}/positions", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<PositionResponse>> getPositions(
            @PathVariable("id") @Min(1) long id,
            HttpServletRequest request) {
        List<PositionResponse> positions = accounts.getPositions(id);  // Throws 404 if not found
        authService.verifyAccountAccess(request, id);                  // Throws 403 if no access
        return ResponseEntity.ok(positions);
    }

    @GetMapping(value = "/{id}/orders", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<OrderHistoryEntry>> getOrders(
            @PathVariable("id") @Min(1) long id,
            @RequestParam(value = "status", required = false) OrderStatus status,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            HttpServletRequest request) {
        List<OrderHistoryEntry> orders = accounts.getOrders(id, status, from, to);  // Throws 404 if not found
        authService.verifyAccountAccess(request, id);                                // Throws 403 if no access
        return ResponseEntity.ok(orders);
    }
}
