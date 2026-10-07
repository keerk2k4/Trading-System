package com.tradingsystem.spring_boot_app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of PATCH /api/v1/admin/accounts/{id}/status. A status outside
 * {@link AccountStatus} fails to parse and answers VAL-422.
 *
 * @param reason why the admin is making the change; kept in the audit trail
 */
public record ChangeAccountStatusRequest(
        @NotNull AccountStatus status,
        @NotBlank @Size(max = 500) String reason) {
}
