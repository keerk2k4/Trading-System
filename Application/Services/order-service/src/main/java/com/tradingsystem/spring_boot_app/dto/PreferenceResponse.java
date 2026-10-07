package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.spring_boot_app.preferences.AlertChannel;

/**
 * GET /api/v1/preferences/me response. A missing row is NOT a 404: the
 * documented defaults are returned (channel EMAIL, no default account), so
 * the settings screen always has something to render.
 */
public record PreferenceResponse(Long accountId, Long defaultAccountId, AlertChannel alertChannel) {
}
