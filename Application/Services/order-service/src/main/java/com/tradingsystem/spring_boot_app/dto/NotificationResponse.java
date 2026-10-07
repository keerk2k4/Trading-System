package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.spring_boot_app.notification.NotificationStatus;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;

import java.time.OffsetDateTime;

/**
 * GET /api/v1/notifications/me row. The recorded channel is the one the
 * message was actually routed on, not the customer's current preference.
 */
public record NotificationResponse(Long notificationId, String eventId, Long accountId,
                                   NotificationType type, String title, String message,
                                   AlertChannel channel, NotificationStatus status,
                                   OffsetDateTime createdOn, OffsetDateTime sentOn) {
}
