package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.dto.PreferenceResponse;
import com.tradingsystem.spring_boot_app.dto.UpdatePreferenceRequest;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.PreferenceMapper;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import com.tradingsystem.spring_boot_app.preferences.CustomerPreferenceResolver;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Customer Preferences owner (docs/sprint/customer-preferences.md).
 *
 * <p>Stores references only: the default account id and the alert channel.
 * Account details stay with the account layer; contact details stay with
 * auth-service. The only cross-module seam is {@link CustomerPreferenceResolver},
 * implemented here and consumed in-process by notifications -- never over HTTP
 * and never by handing out this mapper.
 */
@Service
public class PreferenceService implements CustomerPreferenceResolver {

    private final PreferenceMapper preferences;
    private final AccountMapper accounts;

    public PreferenceService(PreferenceMapper preferences, AccountMapper accounts) {
        this.preferences = preferences;
        this.accounts = accounts;
    }

    /**
     * Read my preferences. Never 404: without a stored row the documented
     * defaults are returned (EMAIL channel, no default account).
     */
    public PreferenceResponse getPreferences(long accountId) {
        accounts.findAccountById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        return preferences.findByAccountId(accountId)
                .map(row -> new PreferenceResponse(accountId, row.defaultAccountId(), row.alertChannel()))
                .orElseGet(() -> new PreferenceResponse(accountId, null, AlertChannel.EMAIL));
    }

    /**
     * Create or partially update my preferences. A default account must exist
     * and belong to my holder, otherwise VAL-422: one customer can never point
     * their default at another customer's account.
     */
    @Transactional
    public PreferenceResponse updatePreferences(long accountId, UpdatePreferenceRequest request) {
        Account mine = accounts.findAccountById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        if (request.getDefaultAccountId() == null && request.getAlertChannel() == null) {
            throw new InvalidOrderArgumentException("Preference", "empty");
        }
        if (request.getDefaultAccountId() != null) {
            Account target = accounts.findAccountById(request.getDefaultAccountId())
                    .orElseThrow(() -> new InvalidOrderArgumentException(
                            "defaultAccountId", String.valueOf(request.getDefaultAccountId())));
            String mineHolder = mine.getHolder() == null ? null : mine.getHolder().getUserId();
            String targetHolder = target.getHolder() == null ? null : target.getHolder().getUserId();
            if (mineHolder == null || !mineHolder.equals(targetHolder)) {
                throw new InvalidOrderArgumentException(
                        "defaultAccountId", String.valueOf(request.getDefaultAccountId()));
            }
        }
        preferences.upsert(accountId, request.getDefaultAccountId(), request.getAlertChannel());
        return getPreferences(accountId);
    }

    /**
     * Channel resolution for notifications. In-process, current row on every
     * call (never cached here), documented default EMAIL when nothing stored.
     */
    @Override
    public AlertChannel resolveAlertChannel(long accountId) {
        return preferences.findByAccountId(accountId)
                .map(PreferenceMapper.PreferenceRow::alertChannel)
                .orElse(AlertChannel.EMAIL);
    }
}
