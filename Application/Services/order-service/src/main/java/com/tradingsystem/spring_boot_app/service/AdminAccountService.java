package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.spring_boot_app.dto.AdminAccountDetail;
import com.tradingsystem.spring_boot_app.dto.AdminAccountSummary;
import com.tradingsystem.spring_boot_app.exception.AccountStatusChangeNotAllowedException;
import com.tradingsystem.spring_boot_app.mapper.AdminAccountMapper;
import com.tradingsystem.spring_boot_app.mapper.AdminAccountMapper.OrderStatusCount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Admin view and control of trading-account status.
 *
 * <p>Allowed changes:
 * <pre>
 *   PENDING   -> BLOCKED, CLOSED            (ACTIVE only through KYC approval)
 *   ACTIVE    -> SUSPENDED, BLOCKED, CLOSED
 *   SUSPENDED -> ACTIVE, BLOCKED, CLOSED
 *   BLOCKED   -> ACTIVE, SUSPENDED, CLOSED
 *   CLOSED    -> nothing                    (permanent, migration 001)
 * </pre>
 *
 * <p>Nothing else has to be told about a change: the Trade API checks the
 * status on every request (AccountSessionService), the Auth service checks it
 * on every sign-in and refresh, and orders need ACTIVE (business rule 2).
 */
@Service
public class AdminAccountService {

    /** The most rows one list request returns; narrow the filter to see others. */
    static final int MAX_RESULTS = 50;

    private static final Logger LOGGER = LoggerFactory.getLogger(AdminAccountService.class);

    private static final Map<String, List<String>> ALLOWED = Map.of(
            "PENDING", List.of("BLOCKED", "CLOSED"),
            "ACTIVE", List.of("SUSPENDED", "BLOCKED", "CLOSED"),
            "SUSPENDED", List.of("ACTIVE", "BLOCKED", "CLOSED"),
            "BLOCKED", List.of("ACTIVE", "SUSPENDED", "CLOSED"),
            "CLOSED", List.of());
    private static final Set<String> STATUSES = ALLOWED.keySet();

    private final AdminAccountMapper accounts;

    public AdminAccountService(AdminAccountMapper accounts) {
        this.accounts = accounts;
    }

    /**
     * @param status        optional; must be one of the five statuses
     * @param accountNumber optional exact account number
     * @param userIds       optional Auth user ids (a name search done in the Auth service)
     */
    public List<AdminAccountSummary> search(String status, String accountNumber, List<String> userIds) {
        String normalisedStatus = blankToNull(status);
        if (normalisedStatus != null) {
            normalisedStatus = normalisedStatus.toUpperCase();
            if (!STATUSES.contains(normalisedStatus)) {
                // Unknown filter value: nothing can match, and nothing reaches SQL.
                return List.of();
            }
        }
        List<String> ids = userIds == null ? List.of()
                : userIds.stream().map(String::trim).filter(id -> !id.isEmpty()).distinct().toList();
        return accounts.searchAccounts(normalisedStatus, blankToNull(accountNumber), ids, MAX_RESULTS);
    }

    public AdminAccountDetail detail(long accountId) {
        AdminAccountSummary account = accounts.findAccount(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));

        Map<String, Long> ordersByStatus = new LinkedHashMap<>();
        for (OrderStatusCount count : accounts.countOrdersByStatus(accountId)) {
            ordersByStatus.put(count.status(), count.total());
        }

        return new AdminAccountDetail(
                account,
                accounts.countOpenPositions(accountId),
                ordersByStatus,
                accounts.findLastOrderAt(accountId),
                allowedNext(account.status()),
                accounts.findStatusChanges(accountId));
    }

    /**
     * Moves the account to {@code toStatus} and records who did it and why,
     * in one transaction.
     *
     * @throws AccountNotFoundException               no such account (ACC-404)
     * @throws AccountStatusChangeNotAllowedException the rules forbid it, or the status
     *                                                changed meanwhile (ACC-409)
     */
    @Transactional
    public AdminAccountDetail changeStatus(long accountId, String toStatus, String reason, String adminUserId) {
        AdminAccountSummary account = accounts.findAccount(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        String from = account.status();

        if (!allowedNext(from).contains(toStatus)) {
            throw new AccountStatusChangeNotAllowedException(from, toStatus);
        }
        // Conditional on the status just read: another admin's change in
        // between makes this update nothing, and this one is refused.
        if (accounts.updateStatusIfCurrent(accountId, from, toStatus) != 1) {
            throw new AccountStatusChangeNotAllowedException(from, toStatus);
        }
        accounts.insertStatusChange(accountId, from, toStatus, reason.trim(), adminUserId);
        LOGGER.info("Account {} status changed {} -> {} by admin {}", accountId, from, toStatus, adminUserId);

        return detail(accountId);
    }

    static List<String> allowedNext(String status) {
        return ALLOWED.getOrDefault(status == null ? "" : status.trim().toUpperCase(), List.of());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
