package com.tradingsystem.spring_boot_app.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradingsystem.spring_boot_app.mapper.NotificationMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.notification.NotificationStatus;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import com.tradingsystem.spring_boot_app.service.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TradeEventConsumer records, acks, then delivers")
class TradeEventConsumerTest {

    @Mock
    private OrderMapper orders;
    @Mock
    private NotificationService notifications;
    @Mock
    private Acknowledgment ack;

    private TradeEventConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new TradeEventConsumer(new ObjectMapper(), orders, notifications);
    }

    private static String envelope(String eventId, String eventType, String payload) {
        return "{\"eventId\":\"" + eventId + "\",\"eventType\":\"" + eventType
                + "\",\"eventTime\":\"2026-10-07T09:00:00Z\",\"source\":\"trade-executor\","
                + "\"schemaVersion\":1,\"payload\":" + payload + "}";
    }

    private NotificationMapper.NotificationRow stored(String eventId) {
        return new NotificationMapper.NotificationRow(1L, eventId, 6L,
                NotificationType.ORDER_FILLED, "t", "m",
                AlertChannel.EMAIL, NotificationStatus.QUEUED,
                LocalDateTime.of(2026, 10, 7, 9, 0), null);
    }

    @Test
    @DisplayName("Thin executor event is enriched, recorded, acked, then delivered")
    void thinEventRecordAckDeliver() {
        String message = envelope("evt-1", "ORDER_FILLED",
                "{\"orderId\":\"11\",\"accountId\":6,\"status\":\"FILLED\","
                        + "\"executionPrice\":25.50,\"reason\":null}");
        when(orders.findOrderById(11L)).thenReturn(Optional.empty());
        when(notifications.recordFromEvent(eq("evt-1"), eq(NotificationType.ORDER_FILLED), eq(6L),
                anyString(), anyString())).thenReturn(Optional.of(stored("evt-1")));

        consumer.consumeTradeEvent(message, ack);

        verify(notifications).recordFromEvent(eq("evt-1"), eq(NotificationType.ORDER_FILLED), eq(6L),
                anyString(), anyString());
        verify(ack).acknowledge();
        verify(notifications).deliver(any(NotificationMapper.NotificationRow.class));
    }

    @Test
    @DisplayName("Duplicate event is still acked but never delivered twice")
    void duplicateIsAckedNotDelivered() {
        String message = envelope("evt-1", "ORDER_REJECTED",
                "{\"orderId\":\"12\",\"accountId\":6,\"status\":\"REJECTED\","
                        + "\"executionPrice\":null,\"reason\":\"INSUFFICIENT_FUNDS\"}");
        when(orders.findOrderById(12L)).thenReturn(Optional.empty());
        when(notifications.recordFromEvent(eq("evt-1"), eq(NotificationType.ORDER_REJECTED), eq(6L),
                anyString(), anyString())).thenReturn(Optional.empty());

        consumer.consumeTradeEvent(message, ack);

        verify(ack).acknowledge();
        verify(notifications, never()).deliver(any());
    }

    @Test
    @DisplayName("Poison message is logged, acked, and never blocks the partition")
    void poisonIsSkipped() {
        consumer.consumeTradeEvent("{not json", ack);

        verify(ack).acknowledge();
        verify(notifications, never()).recordFromEvent(anyString(), any(), anyLong(),
                anyString(), anyString());
    }

    @Test
    @DisplayName("Unknown event types are ignored but acked")
    void unknownTypeIgnored() {
        String message = envelope("evt-9", "QUOTE",
                "{\"symbol\":\"AAPL\",\"accountId\":6}");

        consumer.consumeTradeEvent(message, ack);

        verify(ack).acknowledge();
        verify(notifications, never()).recordFromEvent(anyString(), any(), anyLong(),
                anyString(), anyString());
    }
}
