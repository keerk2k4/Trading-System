package com.tradingsystem.spring_boot_app.notification;

/**
 * What a notification is about. The first three come from {@code trade-events};
 * PRICE_ALERT arrives in-process through {@link NotificationDeliveryService}.
 */
public enum NotificationType {
    ORDER_FILLED,
    ORDER_REJECTED,
    ORDER_CANCELLED,
    PRICE_ALERT
}
