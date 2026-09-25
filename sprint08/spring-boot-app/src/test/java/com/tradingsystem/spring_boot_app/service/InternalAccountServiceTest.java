package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InternalAccountServiceTest {

    private static final String USER_ID = "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e";

    @Mock
    private AccountMapper accounts;

    private InternalAccountService service;

    @BeforeEach
    void setUp() {
        service = new InternalAccountService(accounts);
    }

    @Test
    void createAccountUsesGeneratedReferenceAndInitialTradingState() {
        when(accounts.insertAccount(anyString(), eq(USER_ID), eq("ACTIVE"))).thenReturn(41L);

        InternalAccountResponse response = service.createAccountForUser(USER_ID);

        ArgumentCaptor<String> generatedReference = ArgumentCaptor.forClass(String.class);
        verify(accounts).insertAccount(generatedReference.capture(), eq(USER_ID), eq("ACTIVE"));
        assertAll(
                () -> assertTrue(generatedReference.getValue().matches("ACC-\\d+")),
                () -> assertEquals(generatedReference.getValue(), response.accountNumber()),
                () -> assertEquals(41L, response.accountId()),
                () -> assertEquals(BigDecimal.ZERO, response.availableBalance()),
                () -> assertEquals("ACTIVE", response.accountStatus())
        );
    }

    @Test
    void findAccountByUserMapsTheCurrentDatabaseValues() {
        Account account = org.mockito.Mockito.mock(Account.class);
        when(account.getAccountId()).thenReturn(52L);
        when(account.getAccountReference()).thenReturn("ACC-current");
        when(account.getCashBalance()).thenReturn(new BigDecimal("730.25"));
        when(account.getTradingStatus()).thenReturn(TradingStatus.SUSPENDED);
        when(accounts.findAccountByUserId(USER_ID)).thenReturn(Optional.of(account));

        Optional<InternalAccountResponse> result = service.findAccountByUserId(USER_ID);

        assertTrue(result.isPresent());
        assertAll(
                () -> assertEquals(52L, result.orElseThrow().accountId()),
                () -> assertEquals("ACC-current", result.orElseThrow().accountNumber()),
                () -> assertEquals(new BigDecimal("730.25"), result.orElseThrow().availableBalance()),
                () -> assertEquals("SUSPENDED", result.orElseThrow().accountStatus())
        );
    }

    @Test
    void findAccountByUserPreservesEmptyLookupResult() {
        when(accounts.findAccountByUserId(USER_ID)).thenReturn(Optional.empty());

        assertTrue(service.findAccountByUserId(USER_ID).isEmpty());
    }
}
