package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.NotificationResponse;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Customer notification history (docs/sprint/customer-notifications.md).
 *
 * <p>JWT-derived identity only: history is read for the token's account, so a
 * token for account 6 can never reach account 7's notifications -- there is
 * no account parameter to tamper with at all.
 */
@RestController
@Tag(name = "Notifications", description = "The signed-in customer's notification inbox")
@RequestMapping("/api/v1/notifications")
@Validated
public class NotificationController {

    private final NotificationService notifications;
    private final AuthService authService;

    public NotificationController(NotificationService notifications, AuthService authService) {
        this.notifications = notifications;
        this.authService = authService;
    }

    @Operation(summary = "List my notifications, newest first")
    @GetMapping(value = "/me", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<NotificationResponse>> getMyNotifications(HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(notifications.getHistory(accountId));
    }
}
