package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.internal.CreateAccountRequest;
import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.service.InternalAccountService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    @GetMapping("/by-user/{userId}")
    public ResponseEntity<InternalAccountResponse> getAccountByUserId(
            @PathVariable String userId) {

        return internalAccountService.findAccountByUserId(userId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}