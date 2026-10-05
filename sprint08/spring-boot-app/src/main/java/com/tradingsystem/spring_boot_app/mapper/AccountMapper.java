package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.Account;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Account entity (trading_accounts table).
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 *
 * NOTE: trading_accounts.user_id is now VARCHAR(36) holding a UUID string
 * (migration 007). insertAccount and findAccountByUserId below already
 * reflect that. However, UserMapper.findUserById(Long) still expects a
 * Long -- meaning the "holder" @One lookups in findAccountById,
 * findAccountByNumber, findAccountsByStatus and findAccountsCreatedAfter
 * below are currently type-mismatched too, and will fail at runtime the
 * moment they're actually exercised. That's a separate fix, touching
 * UserMapper.java, not addressed in this pass.
 */
@Mapper
public interface AccountMapper {

    /**
     * Inserts a new trading account, linked to an Auth Service user by
     * their UUID. The account ID and timestamps are generated
     * automatically; a brand-new account always starts at zero balance
     * and ACTIVE status.
     *
     * @param accountNumber a generated, human-readable account reference
     * @param userId the Auth Service user's UUID, as a string
     * @param accountStatus the starting account status
     * @return the generated accountId
     */
    @Insert("""
    INSERT INTO trading_accounts (account_number, user_id, account_status, available_balance, blocked_balance, version, created_at, updated_at)
    VALUES (#{accountNumber}, #{userId}, #{accountStatus}, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING trading_account_id
    """)
Long insertAccount(
    @Param("accountNumber") String accountNumber,
    @Param("userId") String userId,
    @Param("accountStatus") String accountStatus
);

    /**
     * Selects an account by account ID.
     * @param accountId the account ID to search for (bound parameter)
     * @return the account, or empty if not found
     */
    @Select("""
        SELECT trading_account_id, account_number, user_id, available_balance, account_status, version
        FROM trading_accounts
        WHERE trading_account_id = #{accountId}
        """)
    @Results({
        @Result(property = "accountId", column = "trading_account_id"),
        @Result(property = "accountReference", column = "account_number"),
        @Result(property = "cashBalance", column = "available_balance"),
        @Result(property = "tradingStatus", column = "account_status"),
        @Result(property = "holder", column = "user_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.UserMapper.findUserById"))
    })
    @ConstructorArgs({
        @Arg(column = "trading_account_id", javaType = Long.class),
        @Arg(column = "account_number", javaType = String.class),
        @Arg(column = "user_id", javaType = com.tradingsystem.domain.entities.User.class, select = "com.tradingsystem.spring_boot_app.mapper.UserMapper.findUserById"),
        @Arg(column = "available_balance", javaType = BigDecimal.class),
        @Arg(column = "account_status", javaType = com.tradingsystem.domain.enums.TradingStatus.class),
        @Arg(column = "version", javaType = Long.class)
    })
    Optional<Account> findAccountById(@Param("accountId") Long accountId);

    /**
     * Selects an account by account number (key).
     * The account number is treated as a bound parameter to prevent SQL injection.
     * @param accountNumber the account number to search for (bound parameter)
     * @return the account, or empty if not found
     */
    @Select("""
        SELECT trading_account_id, account_number, user_id, status, available_balance, blocked_balance, account_status, created_at, updated_at
        FROM trading_accounts
        WHERE account_number = #{accountNumber}
        """)
    @Results({
        @Result(property = "accountId", column = "trading_account_id"),
        @Result(property = "accountReference", column = "account_number"),
        @Result(property = "cashBalance", column = "available_balance"),
        @Result(property = "tradingStatus", column = "account_status"),
        @Result(property = "holder", column = "user_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.UserMapper.findUserById"))
    })
    Optional<Account> findAccountByNumber(@Param("accountNumber") String accountNumber);

    /**
     * Selects accounts by status filter.
     * The status is treated as a bound parameter to prevent SQL injection.
     * @param status the account status filter (bound parameter)
     * @return list of accounts matching the status
     */
    @Select("""
        SELECT trading_account_id, account_number, user_id, status, available_balance, blocked_balance, account_status, created_at, updated_at
        FROM trading_accounts
        WHERE account_status = #{status}
        ORDER BY trading_account_id
        """)
    @Results({
        @Result(property = "accountId", column = "trading_account_id"),
        @Result(property = "accountReference", column = "account_number"),
        @Result(property = "cashBalance", column = "available_balance"),
        @Result(property = "tradingStatus", column = "account_status"),
        @Result(property = "holder", column = "user_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.UserMapper.findUserById"))
    })
    List<Account> findAccountsByStatus(@Param("status") String status);

    /**
     * Updates the available balance for an account.
     * @param accountId the account ID (bound parameter)
     * @param availableBalance the new available balance (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE trading_accounts
        SET available_balance = #{availableBalance}, version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE trading_account_id = #{accountId} AND version = #{version}
        """)
    int updateAvailableBalanceOptimistic(@Param("accountId") Long accountId,
                                         @Param("availableBalance") BigDecimal availableBalance,
                                         @Param("version") Long version);

    /**
     * Updates the blocked balance for an account.
     * @param accountId the account ID (bound parameter)
     * @param blockedBalance the new blocked balance (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE trading_accounts
        SET blocked_balance = #{blockedBalance}, version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE trading_account_id = #{accountId} AND version = #{version}
        """)
    int updateBlockedBalance(@Param("accountId") Long accountId,
                             @Param("blockedBalance") BigDecimal blockedBalance,
                             @Param("version") Long version);

    /**
     * Updates account status.
     * @param accountId the account ID (bound parameter)
     * @param status the new status (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE trading_accounts
        SET account_status = #{status}, version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE trading_account_id = #{accountId} AND version = #{version}
        """)
    int updateAccountStatus(@Param("accountId") Long accountId,
                            @Param("status") String status,
                            @Param("version") Long version);

    /**
     * Selects accounts created after a given timestamp.
     * @param createdAfter the timestamp filter (bound parameter)
     * @return list of accounts created after the timestamp
     */
    @Select("""
        SELECT trading_account_id, account_number, user_id, status, available_balance, blocked_balance, account_status, created_at, updated_at
        FROM trading_accounts
        WHERE created_at >= #{createdAfter}
        ORDER BY created_at
        """)
    @Results({
        @Result(property = "accountId", column = "trading_account_id"),
        @Result(property = "accountReference", column = "account_number"),
        @Result(property = "cashBalance", column = "available_balance"),
        @Result(property = "tradingStatus", column = "account_status"),
        @Result(property = "holder", column = "user_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.UserMapper.findUserById"))
    })
    List<Account> findAccountsCreatedAfter(@Param("createdAfter") java.time.LocalDateTime createdAfter);

    /**
     * Selects an account by the Auth Service user's UUID.
     * @param userId the user's UUID, as a string
     * @return the account, or empty if not found
     */
    @Select("""
    SELECT trading_account_id, account_number, user_id, available_balance, account_status, version
    FROM trading_accounts
    WHERE user_id = #{userId}
    """)
@ConstructorArgs({
    @Arg(column = "trading_account_id", javaType = Long.class),
    @Arg(column = "account_number", javaType = String.class),
    @Arg(column = "user_id", javaType = com.tradingsystem.domain.entities.User.class, select = "com.tradingsystem.spring_boot_app.mapper.UserMapper.findUserById"),
    @Arg(column = "available_balance", javaType = BigDecimal.class),
    @Arg(column = "account_status", javaType = com.tradingsystem.domain.enums.TradingStatus.class),
    @Arg(column = "version", javaType = Long.class)
})
Optional<Account> findAccountByUserId(@Param("userId") String userId);
}