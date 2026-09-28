package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.internal.CreateAccountRequest;
import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.security.JwtTokenProvider;
import com.tradingsystem.spring_boot_app.service.InternalAccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Internal-only endpoints, called by Auth Service during registration and
 * login/refresh. Not part of the public contract in contracts/auth-api.yaml.
 *
 * SECURITY: All endpoints require a valid Bearer token signed by the Auth Service.
 * The token must have service="auth-service" claim and a valid signature (HS256).
 * This ensures only the Auth Service can call these endpoints.
 */
@RestController
@RequestMapping("/internal/accounts")
public class InternalAccountController {

    private static final Logger LOGGER = LoggerFactory.getLogger(InternalAccountController.class);
    private static final String BEARER_PREFIX = "Bearer ";
    
    private final InternalAccountService internalAccountService;
    private final JwtTokenProvider tokenProvider;

    public InternalAccountController(
            InternalAccountService internalAccountService,
            JwtTokenProvider tokenProvider) {
        this.internalAccountService = internalAccountService;
        this.tokenProvider = tokenProvider;
    }
    
    /**
     * Validates the Authorization header and extracts the bearer token.
     * 
     * @param request HTTP request containing Authorization header
     * @return The token string (without "Bearer " prefix)
     * @throws UnauthorisedException if header is missing, malformed, or token is invalid
     */
    private String validateAndExtractToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");

        System.out.println(authHeader);
        
        if (authHeader == null || authHeader.isBlank()) {
            LOGGER.warn("Missing Authorization header on internal endpoint");
            System.out.println("1");
            throw new UnauthorisedException();
        }
        
        if (!authHeader.startsWith(BEARER_PREFIX)) {
            System.out.println("2");
            LOGGER.warn("Authorization header does not start with 'Bearer '");
            throw new UnauthorisedException();
        }
        
        String token = authHeader.substring(BEARER_PREFIX.length());
        
        if (token.isBlank()) {
            System.out.println("3");
            LOGGER.warn("Bearer token is empty");
            throw new UnauthorisedException();
        }
        
        // Validate token signature, expiry, and service claim
        if (!tokenProvider.validateInternalServiceToken(token)) {
            System.out.println("4");
            LOGGER.warn("Internal service token validation failed");
            throw new UnauthorisedException();
        }
        
        return token;
    }

    /**
     * Called once, during registration. Creates a brand new trading account
     * with balance 0.00 and status ACTIVE, linked to the given Auth
     * Service user (a UUID string).
     * 
     * SECURITY: Requires valid Authorization header with Bearer token from Auth Service.
     */
    @PostMapping
    public ResponseEntity<InternalAccountResponse> createAccount(
            @Valid @RequestBody CreateAccountRequest request,
            HttpServletRequest httpRequest) {
        
        // Validate bearer token (throws UnauthorisedException if invalid)
        validateAndExtractToken(httpRequest);
        
        LOGGER.info("Creating account for user: {}", request.userId());
        InternalAccountResponse response = internalAccountService.createAccountForUser(request.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Called on every login and refresh. Looks up the real, current
     * account belonging to this Auth Service user -- never cached in
     * Auth DB, always read fresh from here.
     * 
     * SECURITY: Requires valid Authorization header with Bearer token from Auth Service.
     */
    @GetMapping("/by-user/{userId}")
    public ResponseEntity<InternalAccountResponse> getAccountByUserId(
            @PathVariable String userId,
            HttpServletRequest httpRequest) {
        
        // Validate bearer token (throws UnauthorisedException if invalid)
        validateAndExtractToken(httpRequest);
        
        LOGGER.info("Looking up account for user: {}", userId);
        return internalAccountService.findAccountByUserId(userId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}