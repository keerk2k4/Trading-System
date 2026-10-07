package com.tradingsystem.spring_boot_app.notification;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Outbound delivery on the channel resolved from preferences
 * (docs/sprint/customer-notifications.md section 8).
 *
 * <ul>
 *   <li>PUSH -- in app only. The stored notification row is the push: the
 *   Angular app polls the history and shows it as a toast and in the inbox.</li>
 *   <li>EMAIL -- in app and email. The same row reaches the app, and the
 *   message is also emailed through auth-service, which owns the address.</li>
 *   <li>SMS -- no provider is provisioned; logged only (the approved stub).</li>
 * </ul>
 *
 * Contact details never appear here: the email channel names the user, and
 * per-channel destinations stay fixed by type (no caller-supplied URLs, so no
 * SSRF surface).
 */
@Component
public class NotificationSender {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationSender.class);

    private final AccountMapper accounts;
    private final AuthServiceEmailClient email;

    public NotificationSender(AccountMapper accounts, AuthServiceEmailClient email) {
        this.accounts = accounts;
        this.email = email;
    }

    /**
     * Attempt delivery on the resolved channel.
     *
     * @return true when the channel accepted the message
     */
    public boolean send(AlertChannel channel, long accountId, String title, String message) {
        switch (channel) {
            case EMAIL -> {
                LOGGER.info("NOTIFICATION channel=EMAIL account={} title=\"{}\"", accountId, title);
                return sendEmail(accountId, title, message);
            }
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

    private boolean sendEmail(long accountId, String title, String message) {
        String userId = accounts.findAccountById(accountId)
                .map(Account::getHolder)
                .map(User::getUserId)
                .orElse(null);
        if (userId == null) {
            LOGGER.warn("Notification email for account {} not sent: no account holder", accountId);
            return false;
        }
        return email.sendEmail(userId, title, message);
    }
}
