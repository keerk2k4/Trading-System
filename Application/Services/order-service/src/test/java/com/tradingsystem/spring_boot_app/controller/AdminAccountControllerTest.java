package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.spring_boot_app.dto.AdminAccountDetail;
import com.tradingsystem.spring_boot_app.dto.AdminAccountSummary;
import com.tradingsystem.spring_boot_app.exception.AccountStatusChangeNotAllowedException;
import com.tradingsystem.spring_boot_app.exception.ForbiddenException;
import com.tradingsystem.spring_boot_app.service.AdminAccountService;
import com.tradingsystem.spring_boot_app.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminAccountController.class)
class AdminAccountControllerTest {

    private static final String ADMIN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    private static final LocalDateTime AT = LocalDateTime.of(2026, 9, 1, 9, 0);
    private static final AdminAccountSummary ACCOUNT =
            new AdminAccountSummary(6L, "ACC-6", "user-6", "ACTIVE", new BigDecimal("1000.00"), AT, AT);

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AdminAccountService adminAccounts;

    @MockitoBean
    private AuthService authService;

    @BeforeEach
    void admin() {
        when(authService.authenticatedSubject(any(HttpServletRequest.class))).thenReturn(ADMIN);
    }

    private static AdminAccountDetail detail(String status, List<String> next) {
        return new AdminAccountDetail(
                new AdminAccountSummary(6L, "ACC-6", "user-6", status, new BigDecimal("1000.00"), AT, AT),
                1L, Map.of("FILLED", 3L), AT, next, List.of());
    }

    @Test
    void listsAccountsForAnAdminWithEveryFilterPassedOn() throws Exception {
        when(adminAccounts.search("ACTIVE", "ACC-6", List.of("user-6", "user-7"))).thenReturn(List.of(ACCOUNT));

        mvc.perform(get("/api/v1/admin/accounts")
                        .param("status", "ACTIVE").param("accountNumber", "ACC-6")
                        .param("userId", "user-6").param("userId", "user-7")
                        .header("Authorization", "Bearer admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].accountNumber").value("ACC-6"))
                .andExpect(jsonPath("$[0].userId").value("user-6"))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"));
    }

    @Test
    void customerTokenIsRefusedWithAuth403AndNothingIsRead() throws Exception {
        doThrow(new ForbiddenException()).when(authService).requireAdmin(any(HttpServletRequest.class));

        mvc.perform(get("/api/v1/admin/accounts/6").header("Authorization", "Bearer customer"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("AUTH-403"));
        mvc.perform(patch("/api/v1/admin/accounts/6/status").header("Authorization", "Bearer customer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SUSPENDED\",\"reason\":\"x\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(adminAccounts);
    }

    @Test
    void showsOneAccountWithItsAllowedNextStatuses() throws Exception {
        when(adminAccounts.detail(6L)).thenReturn(detail("ACTIVE", List.of("SUSPENDED", "BLOCKED", "CLOSED")));

        mvc.perform(get("/api/v1/admin/accounts/6").header("Authorization", "Bearer admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.status").value("ACTIVE"))
                .andExpect(jsonPath("$.openPositions").value(1))
                .andExpect(jsonPath("$.ordersByStatus.FILLED").value(3))
                .andExpect(jsonPath("$.allowedNextStatuses[0]").value("SUSPENDED"));
    }

    @Test
    void unknownAccountIsAcc404() throws Exception {
        when(adminAccounts.detail(99L)).thenThrow(new AccountNotFoundException(99L));

        mvc.perform(get("/api/v1/admin/accounts/99").header("Authorization", "Bearer admin"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void changesStatusRecordingTheAdminFromTheToken() throws Exception {
        when(adminAccounts.changeStatus(6L, "SUSPENDED", "Chargeback dispute", ADMIN))
                .thenReturn(detail("SUSPENDED", List.of("ACTIVE", "BLOCKED", "CLOSED")));

        mvc.perform(patch("/api/v1/admin/accounts/6/status").header("Authorization", "Bearer admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SUSPENDED\",\"reason\":\"Chargeback dispute\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.status").value("SUSPENDED"));
        verify(adminAccounts).changeStatus(6L, "SUSPENDED", "Chargeback dispute", ADMIN);
    }

    @Test
    void aChangeTheRulesForbidIsAcc409() throws Exception {
        when(adminAccounts.changeStatus(anyLong(), anyString(), anyString(), anyString()))
                .thenThrow(new AccountStatusChangeNotAllowedException("CLOSED", "ACTIVE"));

        mvc.perform(patch("/api/v1/admin/accounts/6/status").header("Authorization", "Bearer admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVE\",\"reason\":\"Reopen\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ACC-409"))
                .andExpect(jsonPath("$.message").value("This status change is not allowed"));
    }

    @Test
    void aMissingReasonOrAnUnknownStatusIsVal422AndChangesNothing() throws Exception {
        for (String body : new String[]{
                "{\"status\":\"SUSPENDED\"}",
                "{\"status\":\"SUSPENDED\",\"reason\":\"   \"}",
                "{\"status\":\"FROZEN\",\"reason\":\"x\"}"}) {
            mvc.perform(patch("/api/v1/admin/accounts/6/status").header("Authorization", "Bearer admin")
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        }
        verifyNoInteractions(adminAccounts);
    }
}
