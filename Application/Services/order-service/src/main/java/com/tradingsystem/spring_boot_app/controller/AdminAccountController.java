package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.AdminAccountDetail;
import com.tradingsystem.spring_boot_app.dto.AdminAccountSummary;
import com.tradingsystem.spring_boot_app.dto.ChangeAccountStatusRequest;
import com.tradingsystem.spring_boot_app.service.AdminAccountService;
import com.tradingsystem.spring_boot_app.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin-only account list, detail and status changes. Every route calls
 * requireAdmin first, so a customer token is refused with AUTH-403 before
 * anything is read.
 */
@RestController
@Tag(name = "Admin", description = "Admin-only views of the platform")
@RequestMapping("/api/v1/admin/accounts")
public class AdminAccountController {

    private final AdminAccountService adminAccounts;
    private final AuthService authService;

    public AdminAccountController(AdminAccountService adminAccounts, AuthService authService) {
        this.adminAccounts = adminAccounts;
        this.authService = authService;
    }

    @Operation(summary = "List or search trading accounts (admin only, at most 50, newest first)")
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<AdminAccountSummary>> searchAccounts(
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "accountNumber", required = false) String accountNumber,
            @RequestParam(value = "userId", required = false) List<String> userIds,
            HttpServletRequest request) {
        authService.requireAdmin(request);
        return ResponseEntity.ok(adminAccounts.search(status, accountNumber, userIds));
    }

    @Operation(summary = "One trading account with its activity and status history (admin only)")
    @GetMapping(value = "/{accountId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AdminAccountDetail> getAccount(
            @PathVariable("accountId") long accountId,
            HttpServletRequest request) {
        authService.requireAdmin(request);
        return ResponseEntity.ok(adminAccounts.detail(accountId));
    }

    @Operation(summary = "Change a trading account's status, with a reason (admin only)")
    @PatchMapping(value = "/{accountId}/status",
            consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AdminAccountDetail> changeStatus(
            @PathVariable("accountId") long accountId,
            @Valid @RequestBody ChangeAccountStatusRequest body,
            HttpServletRequest request) {
        authService.requireAdmin(request);
        String adminUserId = authService.authenticatedSubject(request);
        return ResponseEntity.ok(adminAccounts.changeStatus(
                accountId, body.status().name(), body.reason(), adminUserId));
    }
}
