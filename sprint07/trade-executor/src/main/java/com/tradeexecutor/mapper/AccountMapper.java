package com.tradeexecutor.mapper;

import com.tradingsystem.domain.entities.Account;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Account entity.
 * Provides database access for accounts in the Trade Executor.
 * All parameters are bound to prevent SQL injection.
 */
@Mapper
public interface AccountMapper {
    
    /**
     * Find an account by account ID.
     * @param accountId the account ID (bound parameter)
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
        @Result(property = "version", column = "version"),
        @Result(property = "holder", column = "user_id", one = @One(select = "findUserById"))
    })
    Optional<Account> findAccountById(@Param("accountId") Long accountId);
    
    /**
     * Get the current version of an account for optimistic locking.
     * @param accountId the account ID (bound parameter)
     * @return the current version, or empty if account not found
     */
    @Select("""
        SELECT version
        FROM trading_accounts
        WHERE trading_account_id = #{accountId}
        """)
    Optional<Long> getAccountVersion(@Param("accountId") Long accountId);
    
    /**
     * Find an account by account number.
     * The account number is treated as a bound parameter to prevent SQL injection.
     * @param accountNumber the account number (bound parameter)
     * @return the account, or empty if not found
     */
    @Select("""
        SELECT trading_account_id, account_number, user_id, available_balance, account_status, version
        FROM trading_accounts
        WHERE account_number = #{accountNumber}
        """)
    @Results({
        @Result(property = "accountId", column = "trading_account_id"),
        @Result(property = "accountReference", column = "account_number"),
        @Result(property = "cashBalance", column = "available_balance"),
        @Result(property = "tradingStatus", column = "account_status"),
        @Result(property = "holder", column = "user_id", one = @One(select = "findUserById"))
    })
    Optional<Account> findAccountByNumber(@Param("accountNumber") String accountNumber);
    
    /**
     * Find accounts by status.
     * @param status the account status filter (bound parameter)
     * @return list of accounts matching the status
     */
    @Select("""
        SELECT trading_account_id, account_number, user_id, available_balance, account_status
        FROM trading_accounts
        WHERE account_status = #{status}
        ORDER BY trading_account_id
        """)
    @Results({
        @Result(property = "accountId", column = "trading_account_id"),
        @Result(property = "accountReference", column = "account_number"),
        @Result(property = "cashBalance", column = "available_balance"),
        @Result(property = "tradingStatus", column = "account_status"),
        @Result(property = "holder", column = "user_id", one = @One(select = "findUserById"))
    })
    List<Account> findAccountsByStatus(@Param("status") String status);
    
    /**
     * Update available balance for an account.
     * @param accountId the account ID (bound parameter)
     * @param availableBalance the new available balance (bound parameter)
     * @param version the current version for optimistic locking (bound parameter)
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
}

