package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.spring_boot_app.dto.internal.InternalAccountResponse;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Optional;

@Service
public class InternalAccountService {

    private static final BigDecimal STARTING_BALANCE = BigDecimal.ZERO;
    private static final String STARTING_STATUS = "ACTIVE";

    private final AccountMapper accountMapper;

    public InternalAccountService(AccountMapper accountMapper) {
        this.accountMapper = accountMapper;
    }

    @Transactional
    public InternalAccountResponse createAccountForUser(String userId) {
        String accountNumber = "ACC-" + System.currentTimeMillis();

        Long newAccountId = accountMapper.insertAccount(accountNumber, userId, STARTING_STATUS);

        return new InternalAccountResponse(newAccountId, accountNumber, STARTING_BALANCE, STARTING_STATUS);
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