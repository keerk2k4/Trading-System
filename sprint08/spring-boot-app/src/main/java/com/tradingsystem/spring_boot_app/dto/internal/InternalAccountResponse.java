package com.tradingsystem.spring_boot_app.dto.internal;

import java.math.BigDecimal;

public record InternalAccountResponse(
        Long accountId,
        String accountNumber,
        BigDecimal availableBalance,
        String accountStatus
) {}