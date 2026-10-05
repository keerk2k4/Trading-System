package com.tradingsystem.spring_boot_app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateWatchlistRequest(
        @NotBlank(message = "Give the watchlist a name.")
        @Size(max = 60, message = "Names are at most 60 characters.")
        String name) {
}
