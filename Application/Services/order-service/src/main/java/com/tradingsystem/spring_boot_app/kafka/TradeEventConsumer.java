package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Consumes {@code trade-events} for customer notifications
 * (docs/sprint/customer-notifications.md).
 *
 * <p>Group id {@code notification-service} follows contracts/kafka-topics.md:
 * one logical consumer per extension module, offsets independent from every
 * other reader of the topic. The offset is committed once the notification
 * is durably QUEUED, never as proof of delivery -- delivery (SENT/FAILED)
 * happens afterwards through the ledger.
 *
 * <p>Parsing is tolerant by design: the executor publishes the thin
 * {@code TradeEvent} shape while the contract documents the rich payload, so
 * order facts (symbol, side, quantity) are enriched from the orders table
 * whenever the row can be found.
 */
@Component
public class TradeEventConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(TradeEventConsumer.class);

    private final ObjectMapper objectMapper;
    private final OrderMapper orders;
    private final NotificationService notifications;

    public TradeEventConsumer(ObjectMapper objectMapper, OrderMapper orders,
                              NotificationService notifications) {
        this.objectMapper = objectMapper;
        this.orders = orders;
        this.notifications = notifications;
    }

    @KafkaListener(
            topics = "${app.kafka.topics.trade-events:trade-events}",
            groupId = "${app.kafka.groups.notification-service:notification-service}"
    )
    public void consumeTradeEvent(String message, Acknowledgment ack) {
        try {
            var root = objectMapper.readTree(message);
            var envelope = root.has("payload") ? root : null;
            var payload = envelope != null ? root.path("payload") : root;

            String eventId = textOrNull(envelope != null ? root : null, "eventId");
            String eventType = textOrNull(envelope != null ? root : null, "eventType");
            NotificationType type = toType(eventType);
            if (eventId == null || type == null) {
                LOGGER.warn("Ignoring trade-events message without eventId/type (eventType={})", eventType);
                acknowledge(ack);
                return;
            }

            Long accountId = longOrNull(payload, "accountId");
            if (accountId == null) {
                LOGGER.warn("Ignoring trade-events message {} without accountId", eventId);
                acknowledge(ack);
                return;
            }

            String orderId = textOrNull(payload, "orderId");
            String status = textOrNull(payload, "status");
            String reason = textOrNull(payload, "reason");
            BigDecimal executedPrice = decimalOrNull(payload, "executedPrice");

            EnrichedOrder enriched = enrich(orderId, payload);
            var recorded = notifications.recordFromEvent(
                    eventId, type, accountId,
                    titleFor(type, enriched.symbol()),
                    messageFor(type, enriched.symbol(), enriched.side(), enriched.quantity(),
                            executedPrice, reason));
            // Durably QUEUED: the offset may move. Delivery happens next and
            // never blocks this partition.
            acknowledge(ack);
            recorded.ifPresent(notifications::deliver);
            LOGGER.info("Notification {} recorded for {} {}", eventId, type, orderId);
        } catch (Exception e) {
            // No DLT infrastructure exists in this service; a poison message
            // must not stall every account keyed to the partition, so it is
            // logged and skipped after the failure is recorded in the log.
            LOGGER.error("Failed processing trade-events message, skipping", e);
            acknowledge(ack);
        }
    }

    private void acknowledge(Acknowledgment ack) {
        if (ack != null) {
            ack.acknowledge();
        }
    }

    private NotificationType toType(String eventType) {
        if (eventType == null) {
            return null;
        }
        return switch (eventType) {
            case "ORDER_FILLED" -> NotificationType.ORDER_FILLED;
            case "ORDER_REJECTED" -> NotificationType.ORDER_REJECTED;
            case "ORDER_CANCELLED", "ORDER_CANCELED" -> NotificationType.ORDER_CANCELLED;
            default -> null;
        };
    }

    private record EnrichedOrder(String symbol, String side, Integer quantity) {
    }

    private EnrichedOrder enrich(String orderId, com.fasterxml.jackson.databind.JsonNode payload) {
        String symbol = textOrNull(payload, "symbol");
        String side = textOrNull(payload, "side");
        Integer quantity = intOrNull(payload, "quantity");
        if (symbol != null && side != null && quantity != null) {
            return new EnrichedOrder(symbol, side, quantity);
        }
        if (orderId != null) {
            try {
                Optional<Order> order = orders.findOrderById(Long.parseLong(orderId));
                if (order.isPresent()) {
                    Order o = order.get();
                    return new EnrichedOrder(
                            symbol != null ? symbol : o.getInstrument().getSymbol(),
                            side != null ? side : o.getSide().name(),
                            quantity != null ? quantity : o.getQuantity());
                }
            } catch (NumberFormatException ex) {
                LOGGER.debug("Order id {} is not numeric, skipping DB enrichment", orderId);
            }
        }
        return new EnrichedOrder(symbol, side, quantity);
    }

    private static String titleFor(NotificationType type, String symbol) {
        String s = symbol == null ? "order" : symbol;
        return switch (type) {
            case ORDER_FILLED -> "Order filled: " + s;
            case ORDER_REJECTED -> "Order rejected: " + s;
            case ORDER_CANCELLED -> "Order cancelled: " + s;
            default -> "Notification: " + s;
        };
    }

    private static String messageFor(NotificationType type, String symbol, String side,
                                     Integer quantity, BigDecimal executedPrice, String reason) {
        String s = symbol == null ? "order" : quantity + " " + symbol;
        String what = "Your order for " + s + (side == null ? "" : " (" + side + ")");
        return switch (type) {
            case ORDER_FILLED -> what + " has been filled"
                    + (executedPrice == null ? "." : " at " + executedPrice + ".");
            case ORDER_REJECTED -> what + " was rejected"
                    + (reason == null ? "." : ": " + reason.replace('_', ' ').toLowerCase() + ".");
            case ORDER_CANCELLED -> what + " was cancelled.";
            default -> what + ".";
        };
    }

    private static String textOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        var v = node.path(field);
        return (v.isMissingNode() || v.isNull()) ? null : v.asText();
    }

    private static Long longOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        String v = textOrNull(node, field);
        if (v == null) {
            return null;
        }
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static Integer intOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        Long v = longOrNull(node, field);
        return v == null ? null : v.intValue();
    }

    private static BigDecimal decimalOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        String v = textOrNull(node, field);
        if (v == null) {
            return null;
        }
        try {
            return new BigDecimal(v);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
