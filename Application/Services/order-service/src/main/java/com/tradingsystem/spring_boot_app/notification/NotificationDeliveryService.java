package com.tradingsystem.spring_boot_app.notification;

import java.math.BigDecimal;

/**
 * Inbound delivery seam for watchlists and price alerts
 * (docs/sprint/customer-notifications.md section 14).
 *
 * <p>A Java interface, deliberately NOT an HTTP route: a customer must never
 * be able to call an endpoint that sends arbitrary notifications. The
 * watchlist module owns "has the threshold been crossed"; this module owns
 * "how do I notify the customer". No destinations cross this boundary, so
 * there is nothing to forge into a server-side request.
 */
public interface NotificationDeliveryService {

    /**
     * Deliver a triggered price alert to an account on its configured channel.
     *
     * @param accountId    the numeric trading-account key
     * @param symbol       instrument symbol, Fauxnance scheme
     * @param triggerPrice the threshold that was crossed
     * @param currentPrice the observed price that crossed it
     * @param direction    e.g. {@code ABOVE} or {@code BELOW}
     */
    void notifyPriceAlert(long accountId, String symbol,
                           BigDecimal triggerPrice, BigDecimal currentPrice,
                           String direction);
}
