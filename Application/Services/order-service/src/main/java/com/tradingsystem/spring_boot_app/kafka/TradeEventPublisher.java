package com.tradingsystem.spring_boot_app.kafka;

import com.tradingsystem.domain.entities.Order;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * Publishes order-lifecycle outcomes of the Trade REST API itself to
 * {@code trade-events}. The executor publishes FILLED/REJECTED; this service
 * publishes CANCELLED, because cancellation happens here (guarded
 * NEW -&gt; CANCELLED transition) and a cancellation is an event the
 * notifications ledger, analytics and the blotter all need to see.
 *
 * <p>Published after the database commit, never inside the transaction
 * (contracts/kafka-topics.md): a published-but-rolled-back cancel would be
 * unrecoverable, while a committed-but-unpublished one replays from the table.
 */
@Component
public class TradeEventPublisher {

    private static final Logger LOGGER = LoggerFactory.getLogger(TradeEventPublisher.class);

    private final KafkaTemplate<String, KafkaMessageEnvelope<TradeEventPayload>> kafkaTemplate;

    public TradeEventPublisher(KafkaTemplate<String, KafkaMessageEnvelope<TradeEventPayload>> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publishOrderCancelled(Order order) {
        String nowIso = DateTimeFormatter.ISO_INSTANT.format(Instant.now());
        BigDecimal price = order.getLimitPrice() == null ? BigDecimal.ZERO : order.getLimitPrice();
        TradeEventPayload payload = new TradeEventPayload(
                String.valueOf(order.getOrderId()),
                order.getAccount().getAccountId(),
                order.getInstrument().getSymbol(),
                order.getSide().name(),
                order.getQuantity(),
                price,
                null,
                "CANCELLED",
                "CANCELLED_BY_CUSTOMER",
                BigDecimal.ZERO,
                0,
                BigDecimal.ZERO,
                nowIso);
        KafkaMessageEnvelope<TradeEventPayload> event = new KafkaMessageEnvelope<>(
                UUID.randomUUID().toString(), "ORDER_CANCELLED", nowIso, "trade-api", 1, payload);
        try {
            kafkaTemplate.send("trade-events", String.valueOf(order.getAccount().getAccountId()), event);
            LOGGER.info("Published ORDER_CANCELLED for order {}", order.getOrderId());
        } catch (Exception e) {
            LOGGER.error("Failed to publish ORDER_CANCELLED for order {}", order.getOrderId(), e);
        }
    }
}
