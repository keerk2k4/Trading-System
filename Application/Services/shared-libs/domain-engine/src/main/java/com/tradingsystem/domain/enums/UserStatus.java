package com.tradingsystem.domain.enums;

public enum UserStatus {
    PENDING,    // Awaiting KYC approval
    ACTIVE,     // Approved and can trade
    BLOCKED,    // Temporarily suspended
    DEACTIVATED // Permanently deactivated
}
