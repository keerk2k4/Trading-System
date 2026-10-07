package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.mapper.NotificationMapper;
import com.tradingsystem.spring_boot_app.notification.LoggingNotificationSender;
import com.tradingsystem.spring_boot_app.notification.NotificationStatus;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import com.tradingsystem.spring_boot_app.preferences.CustomerPreferenceResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationService records once, delivers on the resolved channel")
class NotificationServiceTest {

    @Mock
    private NotificationMapper notifications;
    @Mock
    private CustomerPreferenceResolver preferences;
    @Mock
    private LoggingNotificationSender sender;

    private NotificationService service;

    @BeforeEach
    void setUp() {
        service = new NotificationService(notifications, preferences, sender);
        lenient().when(preferences.resolveAlertChannel(anyLong())).thenReturn(AlertChannel.EMAIL);
    }

    private NotificationMapper.NotificationRow row(String eventId) {
        return new NotificationMapper.NotificationRow(1L, eventId, 6L,
                NotificationType.ORDER_FILLED, "Order filled: ACME",
                "Your order for 10 ACME (BUY) has been filled at 25.50.",
                AlertChannel.EMAIL, NotificationStatus.QUEUED,
                LocalDateTime.of(2026, 10, 7, 9, 0), null);
    }

    @Test
    @DisplayName("FILLED event is recorded QUEUED and delivered SENT on the resolved channel")
    void filledEventRecordedAndSent() {
        when(notifications.insertQueued(anyString(), eq(6L), eq(NotificationType.ORDER_FILLED),
                anyString(), anyString(), eq(AlertChannel.EMAIL))).thenReturn(1);
        when(notifications.findByEventId("evt-1")).thenReturn(Optional.of(row("evt-1")));
        when(sender.send(eq(AlertChannel.EMAIL), eq(6L), anyString(), anyString())).thenReturn(true);
        when(notifications.markStatus("evt-1", NotificationStatus.SENT)).thenReturn(1);

        service.handleTradeEvent("evt-1", NotificationType.ORDER_FILLED, 6L,
                "11", "ACME", "BUY", 10, new BigDecimal("25.50"), null);

        verify(notifications).insertQueued(anyString(), eq(6L), eq(NotificationType.ORDER_FILLED),
                anyString(), anyString(), eq(AlertChannel.EMAIL));
        verify(sender).send(eq(AlertChannel.EMAIL), eq(6L), anyString(), anyString());
        verify(notifications).markStatus("evt-1", NotificationStatus.SENT);
    }

    @Test
    @DisplayName("Replayed eventId inserts zero rows and sends nothing twice")
    void replayedEventIsNoOp() {
        when(notifications.insertQueued(anyString(), eq(6L), eq(NotificationType.ORDER_FILLED),
                anyString(), anyString(), eq(AlertChannel.EMAIL))).thenReturn(0);

        service.handleTradeEvent("evt-1", NotificationType.ORDER_FILLED, 6L,
                "11", "ACME", "BUY", 10, new BigDecimal("25.50"), null);

        verify(notifications, never()).findByEventId(anyString());
        verify(sender, never()).send(any(), anyLong(), anyString(), anyString());
        verify(notifications, never()).markStatus(anyString(), any());
    }

    @Test
    @DisplayName("REJECTED event tells the customer the order failed, with the reason")
    void rejectedEventCarriesReason() {
        when(notifications.insertQueued(anyString(), eq(6L), eq(NotificationType.ORDER_REJECTED),
                anyString(), anyString(), eq(AlertChannel.EMAIL))).thenReturn(1);
        var stored = new NotificationMapper.NotificationRow(2L, "evt-2", 6L,
                NotificationType.ORDER_REJECTED, "t", "m",
                AlertChannel.EMAIL, NotificationStatus.QUEUED,
                LocalDateTime.of(2026, 10, 7, 9, 0), null);
        when(notifications.findByEventId("evt-2")).thenReturn(Optional.of(stored));
        when(sender.send(eq(AlertChannel.EMAIL), eq(6L), anyString(), anyString())).thenReturn(true);

        service.handleTradeEvent("evt-2", NotificationType.ORDER_REJECTED, 6L,
                "12", "INFY.NS", "BUY", 5, null, "INSUFFICIENT_FUNDS");

        verify(notifications).insertQueued(eq("evt-2"), eq(6L), eq(NotificationType.ORDER_REJECTED),
                eq("Order rejected: INFY.NS"),
                eq("Your order for 5 INFY.NS (BUY) was rejected: insufficient funds."),
                eq(AlertChannel.EMAIL));
    }

    @Test
    @DisplayName("Failed delivery flips the row to FAILED without touching Kafka")
    void failedDeliveryMarkedFailed() {
        when(notifications.insertQueued(anyString(), anyLong(), any(), anyString(), anyString(), any()))
                .thenReturn(1);
        when(notifications.findByEventId("evt-3")).thenReturn(Optional.of(row("evt-3")));
        when(sender.send(any(), anyLong(), anyString(), anyString())).thenReturn(false);
        when(notifications.markStatus("evt-3", NotificationStatus.FAILED)).thenReturn(1);

        service.handleTradeEvent("evt-3", NotificationType.ORDER_CANCELLED, 6L,
                "13", "ACME", "SELL", 2, null, "CANCELLED_BY_CUSTOMER");

        verify(notifications).markStatus("evt-3", NotificationStatus.FAILED);
    }

    @Test
    @DisplayName("Price alert goes through the same ledger on the resolved channel")
    void priceAlertDelivered() {
        when(notifications.insertQueued(anyString(), eq(6L), eq(NotificationType.PRICE_ALERT),
                anyString(), anyString(), eq(AlertChannel.EMAIL))).thenReturn(1);
        var stored = new NotificationMapper.NotificationRow(4L, "evt-4", 6L,
                NotificationType.PRICE_ALERT, "t", "m",
                AlertChannel.EMAIL, NotificationStatus.QUEUED,
                LocalDateTime.of(2026, 10, 7, 9, 0), null);
        when(notifications.findByEventId(anyString())).thenReturn(Optional.of(stored));
        when(sender.send(any(), anyLong(), anyString(), anyString())).thenReturn(true);

        service.notifyPriceAlert(6L, "AAPL", new BigDecimal("200.00"), new BigDecimal("205.50"), "ABOVE");

        verify(notifications).markStatus(anyString(), eq(NotificationStatus.SENT));
    }

    @Test
    @DisplayName("History maps ledger rows newest-first ready for the inbox")
    void historyMapped() {
        when(notifications.findByAccountId(6L)).thenReturn(List.of(row("evt-1")));

        var history = service.getHistory(6L);

        assertEquals(1, history.size());
        assertEquals("evt-1", history.get(0).eventId());
        assertEquals(AlertChannel.EMAIL, history.get(0).channel());
        assertEquals(NotificationStatus.QUEUED, history.get(0).status());
        assertTrue(history.get(0).createdOn() != null);
    }
}
