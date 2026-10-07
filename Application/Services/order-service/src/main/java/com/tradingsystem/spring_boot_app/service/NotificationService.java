package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.dto.NotificationResponse;
import com.tradingsystem.spring_boot_app.mapper.NotificationMapper;
import com.tradingsystem.spring_boot_app.notification.LoggingNotificationSender;
import com.tradingsystem.spring_boot_app.notification.NotificationDeliveryService;
import com.tradingsystem.spring_boot_app.notification.NotificationStatus;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import com.tradingsystem.spring_boot_app.preferences.CustomerPreferenceResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Customer Notifications owner (docs/sprint/customer-notifications.md).
 *
 * <p>Two-phase delivery, split so the Kafka offset and the delivery state can
 * never be confused: {@link #recordFromEvent} durably stores QUEUED (this is
 * what lets the consumer commit the offset), {@link #deliver} resolves the
 * channel through {@link CustomerPreferenceResolver} on every send and
 * attempts delivery afterwards. A redelivered event inserts zero rows and the
 * replay is a no-op -- proven by test, not by claim.
 *
 * <p>Messages carry only order facts (symbol, side, quantity, price, status).
 * No credentials, tokens, contact details or internal identifiers, per
 * contracts/kafka-topics.md.
 */
@Service
public class NotificationService implements NotificationDeliveryService {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationMapper notifications;
    private final CustomerPreferenceResolver preferences;
    private final LoggingNotificationSender sender;

    public NotificationService(NotificationMapper notifications,
                               CustomerPreferenceResolver preferences,
                               LoggingNotificationSender sender) {
        this.notifications = notifications;
        this.preferences = preferences;
        this.sender = sender;
    }

    /**
     * Phase 1: durably record the event as QUEUED.
     *
     * @return the stored row, or empty when this eventId was already recorded
     */
    @Transactional
    public Optional<NotificationMapper.NotificationRow> recordFromEvent(
            String eventId, NotificationType type, long accountId, String title, String message) {
        if (eventId == null || eventId.isBlank()) {
            LOGGER.warn("Ignoring notification without eventId (type={})", type);
            return Optional.empty();
        }
        AlertChannel channel = preferences.resolveAlertChannel(accountId);
        int inserted = notifications.insertQueued(eventId, accountId, type, title, message, channel);
        if (inserted == 0) {
            LOGGER.info("Duplicate notification event {} ignored (already recorded)", eventId);
            return Optional.empty();
        }
        return notifications.findByEventId(eventId);
    }

    /**
     * Phase 2: deliver a QUEUED row on its recorded channel and flip it to
     * SENT or FAILED. Never blocks a Kafka partition: failures stay as rows.
     */
    public void deliver(NotificationMapper.NotificationRow row) {
        AlertChannel channel = preferences.resolveAlertChannel(row.accountId());
        boolean ok;
        try {
            ok = sender.send(channel, row.accountId(), row.title(), row.message());
        } catch (Exception e) {
            LOGGER.error("Notification delivery failed for event {}", row.eventId(), e);
            ok = false;
        }
        notifications.markStatus(row.eventId(), ok ? NotificationStatus.SENT : NotificationStatus.FAILED);
    }

    /**
     * Single-call path for tests and the in-process alert interface: record,
     * then deliver when the record was new.
     */
    public void handleTradeEvent(String eventId, NotificationType type, long accountId,
                                 String orderId, String symbol, String side,
                                 Integer quantity, BigDecimal executedPrice, String reason) {
        String title = titleFor(type, symbol);
        String message = messageFor(type, symbol, side, quantity, executedPrice, reason);
        recordFromEvent(eventId, type, accountId, title, message).ifPresent(this::deliver);
        LOGGER.info("Handled {} for order {} on account {}", type, orderId, accountId);
    }

    /**
     * Watchlist/price-alert entry point (the Java interface, not HTTP).
     */
    @Override
    public void notifyPriceAlert(long accountId, String symbol,
                                 BigDecimal triggerPrice, BigDecimal currentPrice,
                                 String direction) {
        String dir = direction == null ? "crossed" : direction;
        String title = "Price alert: " + symbol;
        String message = symbol + " " + dir + " " + triggerPrice + ", now at " + currentPrice + ".";
        String eventId = UUID.randomUUID().toString();
        recordFromEvent(eventId, NotificationType.PRICE_ALERT, accountId, title, message)
                .ifPresent(this::deliver);
    }

    public List<NotificationResponse> getHistory(long accountId) {
        return notifications.findByAccountId(accountId).stream()
                .map(row -> new NotificationResponse(
                        row.notificationId(), row.eventId(), row.accountId(), row.type(),
                        row.title(), row.message(), row.channel(), row.status(),
                        toOffsetUtc(row.createdOn()), toOffsetUtc(row.sentOn())))
                .toList();
    }

    private static String titleFor(NotificationType type, String symbol) {
        return switch (type) {
            case ORDER_FILLED -> "Order filled: " + symbol;
            case ORDER_REJECTED -> "Order rejected: " + symbol;
            case ORDER_CANCELLED -> "Order cancelled: " + symbol;
            default -> "Notification: " + symbol;
        };
    }

    private static String messageFor(NotificationType type, String symbol, String side,
                                     Integer quantity, BigDecimal executedPrice, String reason) {
        String what = (quantity == null ? "Your order" : "Your order for " + quantity + " " + symbol)
                + (side == null ? "" : " (" + side + ")");
        return switch (type) {
            case ORDER_FILLED -> what + " has been filled"
                    + (executedPrice == null ? "." : " at " + executedPrice + ".");
            case ORDER_REJECTED -> what + " was rejected"
                    + (reason == null ? "." : ": " + humanReason(reason) + ".");
            case ORDER_CANCELLED -> what + " was cancelled.";
            default -> what + ".";
        };
    }

    private static String humanReason(String reason) {
        return reason.replace('_', ' ').toLowerCase();
    }

    private java.time.OffsetDateTime toOffsetUtc(LocalDateTime value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }
}
