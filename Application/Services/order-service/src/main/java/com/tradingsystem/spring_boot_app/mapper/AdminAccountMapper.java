package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.spring_boot_app.dto.AccountStatusChange;
import com.tradingsystem.spring_boot_app.dto.AdminAccountSummary;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Queries for the admin account screens. Read-only over the trading tables,
 * except the status change itself and its audit row. Every value is a bound
 * parameter.
 */
@Mapper
public interface AdminAccountMapper {

    /**
     * Accounts matching every filter given (each is optional), newest first.
     *
     * @param userIds Auth user ids, for a search that started with a customer's name
     */
    @Select("""
        <script>
        SELECT trading_account_id, account_number, user_id, account_status,
               available_balance, created_at, updated_at
        FROM trading.trading_accounts
        <where>
          <if test="status != null">account_status = #{status}</if>
          <if test="accountNumber != null">AND account_number = #{accountNumber}</if>
          <if test="userIds != null and !userIds.isEmpty()">
            AND user_id IN
            <foreach item="userId" collection="userIds" open="(" separator="," close=")">#{userId}</foreach>
          </if>
        </where>
        ORDER BY created_at DESC, trading_account_id DESC
        LIMIT #{limit}
        </script>
        """)
    @ConstructorArgs({
        @Arg(column = "trading_account_id", javaType = long.class),
        @Arg(column = "account_number", javaType = String.class),
        @Arg(column = "user_id", javaType = String.class),
        @Arg(column = "account_status", javaType = String.class),
        @Arg(column = "available_balance", javaType = BigDecimal.class),
        @Arg(column = "created_at", javaType = LocalDateTime.class),
        @Arg(column = "updated_at", javaType = LocalDateTime.class)
    })
    List<AdminAccountSummary> searchAccounts(@Param("status") String status,
                                             @Param("accountNumber") String accountNumber,
                                             @Param("userIds") List<String> userIds,
                                             @Param("limit") int limit);

    @Select("""
        SELECT trading_account_id, account_number, user_id, account_status,
               available_balance, created_at, updated_at
        FROM trading.trading_accounts
        WHERE trading_account_id = #{accountId}
        """)
    @ConstructorArgs({
        @Arg(column = "trading_account_id", javaType = long.class),
        @Arg(column = "account_number", javaType = String.class),
        @Arg(column = "user_id", javaType = String.class),
        @Arg(column = "account_status", javaType = String.class),
        @Arg(column = "available_balance", javaType = BigDecimal.class),
        @Arg(column = "created_at", javaType = LocalDateTime.class),
        @Arg(column = "updated_at", javaType = LocalDateTime.class)
    })
    Optional<AdminAccountSummary> findAccount(@Param("accountId") long accountId);

    @Select("""
        SELECT COUNT(*)
        FROM trading.positions
        WHERE trading_account_id = #{accountId} AND quantity > 0 AND position_status = 'OPEN'
        """)
    long countOpenPositions(@Param("accountId") long accountId);

    @Select("""
        SELECT status, COUNT(*) AS total
        FROM trading.orders
        WHERE trading_account_id = #{accountId}
        GROUP BY status
        ORDER BY status
        """)
    @ConstructorArgs({
        @Arg(column = "status", javaType = String.class),
        @Arg(column = "total", javaType = long.class)
    })
    List<OrderStatusCount> countOrdersByStatus(@Param("accountId") long accountId);

    @Select("""
        SELECT MAX(created_at)
        FROM trading.orders
        WHERE trading_account_id = #{accountId}
        """)
    LocalDateTime findLastOrderAt(@Param("accountId") long accountId);

    /**
     * Moves the account only if it is still in {@code fromStatus}, so two
     * admins acting at once cannot both succeed: the second updates nothing.
     *
     * @return 1 when changed, 0 when the status had already moved on
     */
    @Update("""
        UPDATE trading.trading_accounts
        SET account_status = #{toStatus}, version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE trading_account_id = #{accountId} AND account_status = #{fromStatus}
        """)
    int updateStatusIfCurrent(@Param("accountId") long accountId,
                              @Param("fromStatus") String fromStatus,
                              @Param("toStatus") String toStatus);

    @Insert("""
        INSERT INTO trading.account_status_changes
            (trading_account_id, from_status, to_status, reason, changed_by)
        VALUES (#{accountId}, #{fromStatus}, #{toStatus}, #{reason}, #{changedBy})
        """)
    int insertStatusChange(@Param("accountId") long accountId,
                           @Param("fromStatus") String fromStatus,
                           @Param("toStatus") String toStatus,
                           @Param("reason") String reason,
                           @Param("changedBy") String changedBy);

    @Select("""
        SELECT from_status, to_status, reason, changed_by, changed_at
        FROM trading.account_status_changes
        WHERE trading_account_id = #{accountId}
        ORDER BY changed_at DESC, change_id DESC
        """)
    @ConstructorArgs({
        @Arg(column = "from_status", javaType = String.class),
        @Arg(column = "to_status", javaType = String.class),
        @Arg(column = "reason", javaType = String.class),
        @Arg(column = "changed_by", javaType = String.class),
        @Arg(column = "changed_at", javaType = LocalDateTime.class)
    })
    List<AccountStatusChange> findStatusChanges(@Param("accountId") long accountId);

    /** One row of {@link #countOrdersByStatus}. */
    record OrderStatusCount(String status, long total) {
    }
}
