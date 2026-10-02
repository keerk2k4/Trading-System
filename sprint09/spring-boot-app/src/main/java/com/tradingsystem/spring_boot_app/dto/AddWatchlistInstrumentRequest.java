package com.tradingsystem.spring_boot_app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddWatchlistInstrumentRequest(
        @NotBlank(message = "symbol must be provided")
        @Size(max = 20, message = "symbol is too long")
        String symbol) {
}
