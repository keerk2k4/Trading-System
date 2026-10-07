package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AccountSessionServiceTest {

    private AccountMapper accounts;
    private AccountSessionService service;

    @BeforeEach
    void setUp() {
        accounts = mock(AccountMapper.class);
        service = new AccountSessionService(accounts);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PENDING", "ACTIVE", "SUSPENDED", " suspended "})
    void accountsThatMayHoldASessionAreLetThrough(String status) {
        when(accounts.findAccountStatusById(7L)).thenReturn(Optional.of(status));

        assertFalse(service.isLockedOut(7L));
    }

    @ParameterizedTest
    @ValueSource(strings = {"BLOCKED", "CLOSED", "closed", "FROZEN"})
    void blockedClosedAndUnrecognisedStatusesAreLockedOut(String status) {
        when(accounts.findAccountStatusById(7L)).thenReturn(Optional.of(status));

        assertTrue(service.isLockedOut(7L));
    }

    @Test
    void anAccountThatDoesNotExistIsLeftToTheRouteToAnswer() {
        when(accounts.findAccountStatusById(7L)).thenReturn(Optional.empty());

        assertFalse(service.isLockedOut(7L));
    }
}
