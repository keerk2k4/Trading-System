package com.tradingsystem.spring_boot_app.notification;

/**
 * Delivery ledger state, tracked separately from the Kafka offset
 * (docs/sprint/customer-notifications.md section 5).
 *
 * <ul>
 *   <li>QUEUED -- durably recorded; the offset may be committed.</li>
 *   <li>SENT -- the channel accepted it for delivery.</li>
 *   <li>FAILED -- delivery failed; the row stays for inspection, the
 *   partition is never blocked behind an external provider.</li>
 * </ul>
 */
public enum NotificationStatus {
    QUEUED,
    SENT,
    FAILED
}
