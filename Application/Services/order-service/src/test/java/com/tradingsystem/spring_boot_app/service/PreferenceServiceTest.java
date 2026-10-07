package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.dto.PreferenceResponse;
import com.tradingsystem.spring_boot_app.dto.UpdatePreferenceRequest;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.PreferenceMapper;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("PreferenceService stores references, resolves PUSH (in app only) by default")
class PreferenceServiceTest {

    @Mock
    private PreferenceMapper preferences;
    @Mock
    private AccountMapper accounts;

    private PreferenceService service;

    @BeforeEach
    void setUp() {
        service = new PreferenceService(preferences, accounts);
    }

    private Account account(long id, String userId) {
        User user = new User(userId, "Test", "User", "t@example.com", "1", "h", UserStatus.ACTIVE);
        return new Account(id, "ACC-" + id, user, new BigDecimal("1000.00"), TradingStatus.ACTIVE, 0L);
    }

    @Test
    @DisplayName("Missing row returns documented defaults, not 404")
    void missingRowReturnsDefaults() {
        when(accounts.findAccountById(6L)).thenReturn(Optional.of(account(6L, "u-1")));
        when(preferences.findByAccountId(6L)).thenReturn(Optional.empty());

        PreferenceResponse response = service.getPreferences(6L);

        assertEquals(6L, response.accountId());
        assertNull(response.defaultAccountId());
        assertEquals(AlertChannel.PUSH, response.alertChannel());
    }

    @Test
    @DisplayName("Stored row is returned as-is")
    void storedRowReturned() {
        when(accounts.findAccountById(6L)).thenReturn(Optional.of(account(6L, "u-1")));
        when(preferences.findByAccountId(6L)).thenReturn(Optional.of(
                new PreferenceMapper.PreferenceRow(6L, 6L, AlertChannel.SMS)));

        PreferenceResponse response = service.getPreferences(6L);

        assertEquals(6L, response.defaultAccountId());
        assertEquals(AlertChannel.SMS, response.alertChannel());
    }

    @Test
    @DisplayName("Unknown account cannot read preferences")
    void unknownAccountRejected() {
        when(accounts.findAccountById(9L)).thenReturn(Optional.empty());

        assertThrows(AccountNotFoundException.class, () -> service.getPreferences(9L));
    }

    @Test
    @DisplayName("Default account owned by the same holder is accepted")
    void ownDefaultAccountAccepted() {
        when(accounts.findAccountById(6L)).thenReturn(Optional.of(account(6L, "u-1")));
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account(7L, "u-1")));
        when(preferences.findByAccountId(6L)).thenReturn(Optional.of(
                new PreferenceMapper.PreferenceRow(6L, 7L, AlertChannel.PUSH)));

        PreferenceResponse response = service.updatePreferences(6L,
                new UpdatePreferenceRequest(7L, AlertChannel.PUSH));

        verify(preferences).upsert(6L, 7L, AlertChannel.PUSH);
        assertEquals(7L, response.defaultAccountId());
        assertEquals(AlertChannel.PUSH, response.alertChannel());
    }

    @Test
    @DisplayName("Default account of another holder is rejected")
    void foreignDefaultAccountRejected() {
        when(accounts.findAccountById(6L)).thenReturn(Optional.of(account(6L, "u-1")));
        when(accounts.findAccountById(7L)).thenReturn(Optional.of(account(7L, "u-2")));

        assertThrows(InvalidOrderArgumentException.class, () -> service.updatePreferences(6L,
                new UpdatePreferenceRequest(7L, null)));
    }

    @Test
    @DisplayName("Empty update is rejected")
    void emptyUpdateRejected() {
        when(accounts.findAccountById(6L)).thenReturn(Optional.of(account(6L, "u-1")));

        assertThrows(InvalidOrderArgumentException.class, () -> service.updatePreferences(6L,
                new UpdatePreferenceRequest(null, null)));
    }

    @Test
    @DisplayName("Channel resolution falls back to PUSH (in app only) with nothing stored")
    void channelDefaultsToPush() {
        when(preferences.findByAccountId(6L)).thenReturn(Optional.empty());

        assertEquals(AlertChannel.PUSH, service.resolveAlertChannel(6L));
    }

    @Test
    @DisplayName("Channel resolution returns the stored channel")
    void channelResolvedFromRow() {
        when(preferences.findByAccountId(6L)).thenReturn(Optional.of(
                new PreferenceMapper.PreferenceRow(6L, null, AlertChannel.SMS)));

        assertEquals(AlertChannel.SMS, service.resolveAlertChannel(6L));
    }
}
