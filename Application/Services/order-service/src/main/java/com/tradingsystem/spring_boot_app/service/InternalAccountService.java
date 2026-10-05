package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Optional;

@Service
public class InternalAccountService {

    private static final Logger LOGGER = LoggerFactory.getLogger(InternalAccountService.class);
    private static final BigDecimal STARTING_BALANCE = BigDecimal.ZERO;
    private static final String STARTING_STATUS = "PENDING";

    private final AccountMapper accountMapper;
    private final WatchlistService watchlistService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public InternalAccountService(AccountMapper accountMapper, WatchlistService watchlistService) {
        this.accountMapper = accountMapper;
        this.watchlistService = watchlistService;
    }

    /** Backwards-compatible constructor for existing unit tests. */
    public InternalAccountService(AccountMapper accountMapper) {
        this(accountMapper, null);
    }

    @Transactional
    public InternalAccountResponse createAccountForUser(String userId) {
        String accountNumber = "ACC-" + System.currentTimeMillis();

        Long newAccountId = accountMapper.insertAccount(accountNumber, userId, STARTING_STATUS);

        ensureDefaultWatchlist(userId);

        return new InternalAccountResponse(newAccountId, accountNumber, STARTING_BALANCE, STARTING_STATUS);
    }

    private void ensureDefaultWatchlist(String userId) {
        if (watchlistService == null) {
            return;
        }
        try {
            watchlistService.ensureDefaultWatchlist(userId);
        } catch (Exception e) {
            LOGGER.warn("Failed to create default watchlist for user {}", userId, e);
        }
    }

    @Transactional
    public InternalAccountResponse createAccountForUserIfMissing(String userId) {
        return findAccountByUserId(userId).orElseGet(() -> createAccountForUser(userId));
    }

    @Transactional
    public InternalAccountResponse activateAccountForUser(String userId) {
        var account = accountMapper.findAccountByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("Trading account not found for user"));

        String currentStatus = account.getTradingStatus().name();
        if ("ACTIVE".equals(currentStatus)) {
            return new InternalAccountResponse(
                    account.getAccountId(),
                    account.getAccountReference(),
                    account.getCashBalance(),
                    currentStatus
            );
        }

        if (!"PENDING".equals(currentStatus)) {
            throw new IllegalStateException("Account cannot be activated from status " + currentStatus);
        }

        accountMapper.activatePendingAccountByUserId(userId);

        return findAccountByUserId(userId)
            .orElseThrow(() -> new IllegalStateException("Trading account not found for user"));
    }

    public Optional<InternalAccountResponse> findAccountByUserId(String userId) {
        return accountMapper.findAccountByUserId(userId)
        .map(account -> new InternalAccountResponse(
                account.getAccountId(),
                account.getAccountReference(),
                account.getCashBalance(),
                account.getTradingStatus().name()
        ));
    }
}