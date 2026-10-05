package com.tradingsystem.spring_boot_app.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record UpdateBalanceRequest(
        @NotNull
        @DecimalMin(value = "0.00")
        @Digits(integer = 14, fraction = 2)
        BigDecimal cashBalance
) {
}
