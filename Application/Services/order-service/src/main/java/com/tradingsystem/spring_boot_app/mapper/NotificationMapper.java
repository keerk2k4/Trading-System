package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.spring_boot_app.notification.NotificationStatus;
import com.tradingsystem.spring_boot_app.notification.NotificationType;
import com.tradingsystem.spring_boot_app.preferences.AlertChannel;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for the notification delivery ledger (migration 023).
 *
 * <p>Idempotency lives in the UNIQUE constraint on {@code event_id} (the
 * Kafka eventId): a redelivered event inserts zero rows and the second
 * attempt is a no-op, the same discipline the Trade Executor uses for
 * guarded order transitions.
 */
@Mapper
public interface NotificationMapper {

    record NotificationRow(Long notificationId, String eventId, Long accountId,
                           NotificationType type, String title, String message,
                           AlertChannel channel, NotificationStatus status,
                           LocalDateTime createdOn, LocalDateTime sentOn) {
    }

    /**
     * Durably record a notification as QUEUED.
     *
     * @return 1 when stored, 0 when this eventId was already recorded
     */
    @Insert("""
        INSERT INTO trading.notifications
            (event_id, trading_account_id, type, title, message, channel, status)
        VALUES (#{eventId}, #{accountId}, #{type}, #{title}, #{message}, #{channel}, 'QUEUED')
        ON CONFLICT (event_id) DO NOTHING
        """)
    int insertQueued(@Param("eventId") String eventId,
                     @Param("accountId") Long accountId,
                     @Param("type") NotificationType type,
                     @Param("title") String title,
                     @Param("message") String message,
                     @Param("channel") AlertChannel channel);

    @Select("""
        SELECT notification_id AS notificationId, event_id AS eventId,
               trading_account_id AS accountId, type AS type,
               title AS title, message AS message,
               channel AS channel, status AS status,
               created_at AS createdOn, sent_at AS sentOn
        FROM trading.notifications
        WHERE trading_account_id = #{accountId}
        ORDER BY created_at DESC
        """)
    List<NotificationRow> findByAccountId(@Param("accountId") Long accountId);

    @Select("""
        SELECT notification_id AS notificationId, event_id AS eventId,
               trading_account_id AS accountId, type AS type,
               title AS title, message AS message,
               channel AS channel, status AS status,
               created_at AS createdOn, sent_at AS sentOn
        FROM trading.notifications
        WHERE event_id = #{eventId}
        """)
    Optional<NotificationRow> findByEventId(@Param("eventId") String eventId);

    @Update("""
        UPDATE trading.notifications
        SET status = #{status}, sent_at = CASE WHEN #{status} = 'SENT' THEN CURRENT_TIMESTAMP ELSE sent_at END,
            failed_at = CASE WHEN #{status} = 'FAILED' THEN CURRENT_TIMESTAMP ELSE failed_at END
        WHERE event_id = #{eventId} AND status = 'QUEUED'
        """)
    int markStatus(@Param("eventId") String eventId, @Param("status") NotificationStatus status);
}
