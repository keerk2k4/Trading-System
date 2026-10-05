package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.internal.CreateAccountRequest;
import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.service.InternalAccountService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Internal-only endpoints, called by Auth Service during registration and
 * login/refresh. Not part of the public contract in contracts/auth-api.yaml.
 *
 * SECURITY NOTE: this must be blocked from public network access -- either
 * by not exposing this port outside the Docker network in
 * docker-compose.yml, or by adding a shared-secret header check here.
 * Neither is wired in yet; do this before demoing.
 */
@RestController
@RequestMapping("/internal/accounts")
public class InternalAccountController {

    private final InternalAccountService internalAccountService;

    public InternalAccountController(InternalAccountService internalAccountService) {
        this.internalAccountService = internalAccountService;
    }

    /**
     * Called once, during registration. Creates a brand new trading account
     * with balance 0.00 and status ACTIVE, linked to the given Auth
     * Service user (a UUID string).
     */
    @PostMapping
    public ResponseEntity<InternalAccountResponse> createAccount(
            @Valid @RequestBody CreateAccountRequest request) {

        InternalAccountResponse response = internalAccountService.createAccountForUser(request.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Called on every login and refresh. Looks up the real, current
     * account belonging to this Auth Service user -- never cached in
     * Auth DB, always read fresh from here.
     */
    @GetMapping("/by-user/{userId}")
    public ResponseEntity<InternalAccountResponse> getAccountByUserId(
            @PathVariable String userId) {

        return internalAccountService.findAccountByUserId(userId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}