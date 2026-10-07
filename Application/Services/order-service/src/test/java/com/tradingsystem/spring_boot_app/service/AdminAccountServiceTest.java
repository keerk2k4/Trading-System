package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.spring_boot_app.dto.AccountStatusChange;
import com.tradingsystem.spring_boot_app.dto.AdminAccountDetail;
import com.tradingsystem.spring_boot_app.dto.AdminAccountSummary;
import com.tradingsystem.spring_boot_app.exception.AccountStatusChangeNotAllowedException;
import com.tradingsystem.spring_boot_app.mapper.AdminAccountMapper;
import com.tradingsystem.spring_boot_app.mapper.AdminAccountMapper.OrderStatusCount;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminAccountServiceTest {

    private static final long ID = 6L;
    private static final String ADMIN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    private static final LocalDateTime CREATED = LocalDateTime.of(2026, 9, 1, 9, 0);

    private AdminAccountMapper mapper;
    private AdminAccountService service;

    @BeforeEach
    void setUp() {
        mapper = mock(AdminAccountMapper.class);
        service = new AdminAccountService(mapper);
        when(mapper.countOrdersByStatus(ID)).thenReturn(List.of());
        when(mapper.findStatusChanges(ID)).thenReturn(List.of());
    }

    private void accountIn(String status) {
        when(mapper.findAccount(ID)).thenReturn(Optional.of(new AdminAccountSummary(
                ID, "ACC-6", "user-6", status, new BigDecimal("1000.00"), CREATED, CREATED)));
    }

    @ParameterizedTest(name = "{0} -> {1} is allowed")
    @CsvSource({
            "PENDING, BLOCKED", "PENDING, CLOSED",
            "ACTIVE, SUSPENDED", "ACTIVE, BLOCKED", "ACTIVE, CLOSED",
            "SUSPENDED, ACTIVE", "SUSPENDED, BLOCKED", "SUSPENDED, CLOSED",
            "BLOCKED, ACTIVE", "BLOCKED, SUSPENDED", "BLOCKED, CLOSED"
    })
    void allowedChangesUpdateTheAccountAndRecordWhoAndWhy(String from, String to) {
        accountIn(from);
        when(mapper.updateStatusIfCurrent(ID, from, to)).thenReturn(1);

        service.changeStatus(ID, to, "  Customer asked us to  ", ADMIN);

        verify(mapper).updateStatusIfCurrent(ID, from, to);
        verify(mapper).insertStatusChange(ID, from, to, "Customer asked us to", ADMIN);
    }

    @ParameterizedTest(name = "{0} -> {1} is refused")
    @CsvSource({
            "PENDING, ACTIVE", "PENDING, SUSPENDED",
            "CLOSED, ACTIVE", "CLOSED, SUSPENDED", "CLOSED, BLOCKED",
            "ACTIVE, ACTIVE", "ACTIVE, PENDING", "SUSPENDED, PENDING"
    })
    void refusedChangesTouchNothing(String from, String to) {
        accountIn(from);

        assertThrows(AccountStatusChangeNotAllowedException.class,
                () -> service.changeStatus(ID, to, "reason", ADMIN));

        verify(mapper, never()).updateStatusIfCurrent(anyLong(), anyString(), anyString());
        verify(mapper, never()).insertStatusChange(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void aChangeMadeMeanwhileByAnotherAdminIsRefusedAndNotAudited() {
        accountIn("ACTIVE");
        when(mapper.updateStatusIfCurrent(ID, "ACTIVE", "SUSPENDED")).thenReturn(0);

        assertThrows(AccountStatusChangeNotAllowedException.class,
                () -> service.changeStatus(ID, "SUSPENDED", "reason", ADMIN));

        verify(mapper, never()).insertStatusChange(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void anUnknownAccountIsAcc404() {
        when(mapper.findAccount(ID)).thenReturn(Optional.empty());

        assertThrows(AccountNotFoundException.class, () -> service.changeStatus(ID, "SUSPENDED", "reason", ADMIN));
        assertThrows(AccountNotFoundException.class, () -> service.detail(ID));
    }

    @Test
    void detailCarriesActivityHistoryAndTheNextStatusesAllowed() {
        accountIn("SUSPENDED");
        when(mapper.countOpenPositions(ID)).thenReturn(2L);
        when(mapper.countOrdersByStatus(ID)).thenReturn(List.of(
                new OrderStatusCount("FILLED", 5), new OrderStatusCount("REJECTED", 1)));
        LocalDateTime lastOrder = LocalDateTime.of(2026, 10, 6, 14, 30);
        when(mapper.findLastOrderAt(ID)).thenReturn(lastOrder);
        AccountStatusChange change = new AccountStatusChange("ACTIVE", "SUSPENDED", "Chargeback", ADMIN, lastOrder);
        when(mapper.findStatusChanges(ID)).thenReturn(List.of(change));

        AdminAccountDetail detail = service.detail(ID);

        assertEquals("SUSPENDED", detail.account().status());
        assertEquals(2L, detail.openPositions());
        assertEquals(Map.of("FILLED", 5L, "REJECTED", 1L), detail.ordersByStatus());
        assertEquals(lastOrder, detail.lastOrderAt());
        assertEquals(List.of("ACTIVE", "BLOCKED", "CLOSED"), detail.allowedNextStatuses());
        assertEquals(List.of(change), detail.statusHistory());
    }

    @Test
    void aClosedAccountOffersNoNextStatus() {
        accountIn("CLOSED");

        assertEquals(List.of(), service.detail(ID).allowedNextStatuses());
    }

    @Test
    void searchNormalisesFiltersBeforeQuerying() {
        service.search(" suspended ", " ", List.of(" user-1 ", "user-1", "", "user-2"));

        verify(mapper).searchAccounts("SUSPENDED", null, List.of("user-1", "user-2"), AdminAccountService.MAX_RESULTS);
    }

    @Test
    void searchWithAnUnknownStatusMatchesNothingAndRunsNoQuery() {
        assertEquals(List.of(), service.search("FROZEN", null, null));

        verifyNoInteractions(mapper);
    }

    @Test
    void searchWithNoFiltersListsTheNewestAccounts() {
        service.search(null, null, null);

        verify(mapper).searchAccounts(null, null, List.of(), AdminAccountService.MAX_RESULTS);
    }
}
