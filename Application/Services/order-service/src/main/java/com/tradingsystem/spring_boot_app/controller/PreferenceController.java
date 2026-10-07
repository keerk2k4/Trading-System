package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.PreferenceResponse;
import com.tradingsystem.spring_boot_app.dto.UpdatePreferenceRequest;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.PreferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Customer preferences (docs/sprint/customer-preferences.md).
 *
 * <p>JWT-derived identity only: both routes resolve the account from the
 * verified token, so there is no path id to mismatch and no way to read or
 * write another customer's preferences.
 */
@RestController
@Tag(name = "Preferences", description = "The signed-in customer's default account and alert channel")
@RequestMapping("/api/v1/preferences")
@Validated
public class PreferenceController {

    private final PreferenceService preferences;
    private final AuthService authService;

    public PreferenceController(PreferenceService preferences, AuthService authService) {
        this.preferences = preferences;
        this.authService = authService;
    }

    @Operation(summary = "Get my preferences, or the documented defaults when nothing is stored")
    @GetMapping(value = "/me", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PreferenceResponse> getMyPreferences(HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(preferences.getPreferences(accountId));
    }

    @Operation(summary = "Create or update my preferences")
    @PutMapping(value = "/me", consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PreferenceResponse> updateMyPreferences(
            @Valid @RequestBody UpdatePreferenceRequest body,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(preferences.updatePreferences(accountId, body));
    }
}
