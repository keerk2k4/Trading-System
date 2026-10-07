package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Optional;

/**
 * MyBatis mapper for the customer-preferences row (migration 022).
 * One row per trading account; reads go through {@code PreferenceService}
 * and channel resolution goes through {@code CustomerPreferenceResolver} --
 * no other module touches this table directly.
 */
@Mapper
public interface PreferenceMapper {

    record PreferenceRow(Long accountId, Long defaultAccountId, AlertChannel alertChannel) {
    }

    @Select("""
        SELECT trading_account_id AS accountId,
               default_account_id AS defaultAccountId,
               alert_channel AS alertChannel
        FROM trading.customer_preferences
        WHERE trading_account_id = #{accountId}
        """)
    Optional<PreferenceRow> findByAccountId(@Param("accountId") Long accountId);

    @Insert("""
        INSERT INTO trading.customer_preferences (trading_account_id, default_account_id, alert_channel)
        VALUES (#{accountId}, #{defaultAccountId}, #{alertChannel})
        ON CONFLICT (trading_account_id) DO UPDATE SET
            default_account_id = COALESCE(EXCLUDED.default_account_id, trading.customer_preferences.default_account_id),
            alert_channel = COALESCE(EXCLUDED.alert_channel, trading.customer_preferences.alert_channel),
            updated_at = CURRENT_TIMESTAMP
        """)
    int upsert(@Param("accountId") Long accountId,
               @Param("defaultAccountId") Long defaultAccountId,
               @Param("alertChannel") AlertChannel alertChannel);
}
