package com.tradingsystem.spring_boot_app.preferences;

/**
 * Alert channels a customer notification can be delivered on.
 *
 * <p>The stored preference holds one of these per account
 * (docs/sprint/customer-preferences.md). Contact details are deliberately NOT
 * part of this enum: auth-service owns email/phone, so delivery resolves the
 * destination from the owning layer at send time instead of duplicating it.
 */
public enum AlertChannel {
    EMAIL,
    SMS,
    PUSH
}
