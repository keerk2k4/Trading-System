package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Set;

/**
 * Whether a trading account may still use the API at all, checked on every
 * customer request by JwtAuthenticationFilter.
 *
 * <p>A token stays valid for up to fifteen minutes after it is issued. Without
 * this check, an account blocked or closed in that window could keep reading
 * through its existing token until it expired. Orders are not decided here:
 * business rule 2 already accepts them from ACTIVE accounts only, so a
 * SUSPENDED account passes this check and still has its orders refused.
 *
 * <p>The allowed statuses are the same as the Auth service's sign-in rule
 * (auth-service/src/auth/account-access.ts); keep the two in step. Listing the
 * allowed statuses means a status added later is refused until somebody
 * decides otherwise.
 */
@Service
public class AccountSessionService {

    private static final Set<String> SESSION_STATUSES = Set.of("PENDING", "ACTIVE", "SUSPENDED");

    private final AccountMapper accounts;

    public AccountSessionService(AccountMapper accounts) {
        this.accounts = accounts;
    }

    /**
     * @return true when the account exists and its status may not hold a
     *         session (BLOCKED, CLOSED, or anything unrecognised). An account
     *         that does not exist is left to the route, which answers ACC-404.
     */
    public boolean isLockedOut(long accountId) {
        return accounts.findAccountStatusById(accountId)
                .map(status -> !SESSION_STATUSES.contains(status.trim().toUpperCase(Locale.ROOT)))
                .orElse(false);
    }
}
