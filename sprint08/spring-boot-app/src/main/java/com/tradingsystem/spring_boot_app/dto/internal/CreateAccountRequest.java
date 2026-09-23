package com.tradingsystem.spring_boot_app.dto.internal;

import jakarta.validation.constraints.NotBlank;

public record CreateAccountRequest(
        @NotBlank(message = "userId is required")
        String userId
) {}