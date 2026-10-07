package com.tradingsystem.spring_boot_app.notification;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationSender emails only on the EMAIL channel")
class NotificationSenderTest {

    private static final String USER_ID = "8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f";

    @Mock
    private AccountMapper accounts;
    @Mock
    private AuthServiceEmailClient email;

    private NotificationSender sender;

    @BeforeEach
    void setUp() {
        sender = new NotificationSender(accounts, email);
    }

    private void accountHeldBy(String userId) {
        User holder = mock(User.class);
        when(holder.getUserId()).thenReturn(userId);
        Account account = mock(Account.class);
        when(account.getHolder()).thenReturn(holder);
        when(accounts.findAccountById(6L)).thenReturn(Optional.of(account));
    }

    @Test
    @DisplayName("EMAIL (in app and email) emails the account holder through auth-service")
    void emailChannelSendsEmail() {
        accountHeldBy(USER_ID);
        when(email.sendEmail(USER_ID, "Order filled: AAPL", "Filled.")).thenReturn(true);

        assertTrue(sender.send(AlertChannel.EMAIL, 6L, "Order filled: AAPL", "Filled."));
        verify(email).sendEmail(USER_ID, "Order filled: AAPL", "Filled.");
    }

    @Test
    @DisplayName("EMAIL reports failure when auth-service could not send it")
    void emailFailureIsReported() {
        accountHeldBy(USER_ID);
        when(email.sendEmail(anyString(), anyString(), anyString())).thenReturn(false);

        assertFalse(sender.send(AlertChannel.EMAIL, 6L, "Order rejected: AAPL", "Rejected."));
    }

    @Test
    @DisplayName("EMAIL fails without a call when the account has no holder")
    void emailWithoutHolderFails() {
        when(accounts.findAccountById(6L)).thenReturn(Optional.empty());

        assertFalse(sender.send(AlertChannel.EMAIL, 6L, "Order filled: AAPL", "Filled."));
        verify(email, never()).sendEmail(any(), any(), any());
    }

    @Test
    @DisplayName("PUSH (in app only) never sends email")
    void pushNeverEmails() {
        assertTrue(sender.send(AlertChannel.PUSH, 6L, "Order filled: AAPL", "Filled."));
        verify(email, never()).sendEmail(any(), any(), any());
        verify(accounts, never()).findAccountById(any());
    }

    @Test
    @DisplayName("SMS stays a logging stub and never sends email")
    void smsNeverEmails() {
        assertTrue(sender.send(AlertChannel.SMS, 6L, "Order filled: AAPL", "Filled."));
        verify(email, never()).sendEmail(any(), any(), any());
    }
}
