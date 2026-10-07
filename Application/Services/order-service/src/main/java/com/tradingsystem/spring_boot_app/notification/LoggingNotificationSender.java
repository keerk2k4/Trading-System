package com.tradingsystem.spring_boot_app.notification;

import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Outbound channel stub (docs/sprint/customer-notifications.md section 8).
 *
 * <p>No email/SMS/push provider is provisioned in this environment, so the
 * approved logging stub stands in: the routing decision is real (the channel
 * resolved from preferences selects the branch), the resolved channel is
 * recorded on the notification row, and delivery is attempted here rather
 * than merely claimed. Contact details never appear here -- the stub holds no
 * addresses and logs none, and per-channel destinations stay fixed by type
 * (no caller-supplied URLs, so no SSRF surface).
 */
@Component
public class LoggingNotificationSender {

    private static final Logger LOGGER = LoggerFactory.getLogger(LoggingNotificationSender.class);

    /**
     * Attempt delivery on the resolved channel.
     *
     * @return true when the channel accepted the message
     */
    public boolean send(AlertChannel channel, long accountId, String title, String message) {
        switch (channel) {
            case EMAIL -> LOGGER.info("NOTIFICATION channel=EMAIL account={} title=\"{}\" message=\"{}\"",
                    accountId, title, message);
            case SMS -> LOGGER.info("NOTIFICATION channel=SMS account={} title=\"{}\" message=\"{}\"",
                    accountId, title, message);
            case PUSH -> LOGGER.info("NOTIFICATION channel=PUSH account={} title=\"{}\" message=\"{}\"",
                    accountId, title, message);
            default -> {
                LOGGER.warn("NOTIFICATION channel=UNKNOWN account={} title=\"{}\"", accountId, title);
                return false;
            }
        }
        return true;
    }
}
