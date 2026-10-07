package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.AdminHealthResponse;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.PlatformHealthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Admin", description = "Admin-only views of the platform")
@RequestMapping("/api/v1/admin")
public class AdminHealthController {

    private final PlatformHealthService platformHealth;
    private final AuthService authService;

    public AdminHealthController(PlatformHealthService platformHealth, AuthService authService) {
        this.platformHealth = platformHealth;
        this.authService = authService;
    }

    /**
     * Always 200 for an admin: a DOWN service is part of the report, not a
     * failed request. A customer token is refused with AUTH-403.
     */
    @Operation(summary = "Health of the Trade API and its database, Kafka and the Trade Executor (admin only)")
    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AdminHealthResponse> getHealth(HttpServletRequest request) {
        authService.requireAdmin(request);
        return ResponseEntity.ok(platformHealth.check());
    }
}
