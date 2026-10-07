package com.tradingsystem.spring_boot_app.preferences;

/**
 * The single seam between Customer Notifications and Customer Preferences
 * (docs/sprint/customer-preferences.md section 7, docs/sprint/customer-notifications.md
 * section 6).
 *
 * <p>Small, stable, in-process: no HTTP, no JWT, no repositories cross this
 * boundary. The notifications module calls this on every send and records the
 * returned channel on the notification row, so historical routing never has
 * to be reconstructed from current preferences.
 *
 * <p>Agreed default when nothing has been stored: {@link AlertChannel#EMAIL}.
 * Holding the message was considered and rejected: a lost message nobody
 * finds out about is worse than a documented default channel.
 */
public interface CustomerPreferenceResolver {

    /**
     * Resolve the alert channel for an account, falling back to the
     * documented default ({@link AlertChannel#EMAIL}) when no preference row
     * exists. Never returns null and never throws for a missing row.
     *
     * @param accountId the numeric trading-account key
     * @return the channel to deliver on
     */
    AlertChannel resolveAlertChannel(long accountId);
}
