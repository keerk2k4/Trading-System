package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import jakarta.validation.constraints.Min;

/**
 * PUT /api/v1/preferences/me body. Both fields optional; at least one must be
 * present. A default account must belong to the caller's holder (checked in
 * {@code PreferenceService}); anything else is VAL-422.
 */
public class UpdatePreferenceRequest {

    @Min(1)
    private Long defaultAccountId;

    private AlertChannel alertChannel;

    public UpdatePreferenceRequest() {
    }

    public UpdatePreferenceRequest(Long defaultAccountId, AlertChannel alertChannel) {
        this.defaultAccountId = defaultAccountId;
        this.alertChannel = alertChannel;
    }

    public Long getDefaultAccountId() {
        return defaultAccountId;
    }

    public void setDefaultAccountId(Long defaultAccountId) {
        this.defaultAccountId = defaultAccountId;
    }

    public AlertChannel getAlertChannel() {
        return alertChannel;
    }

    public void setAlertChannel(AlertChannel alertChannel) {
        this.alertChannel = alertChannel;
    }
}
