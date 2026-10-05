package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.Settlement;
import org.apache.ibatis.annotations.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Settlement entity.
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 */
@Mapper
public interface SettlementMapper {
    
    /**
     * Inserts a new settlement.
     * @param settlement the settlement to insert
     * @return number of rows affected
     */
    @Insert("""
        INSERT INTO settlements (execution_id, demat_account_id, quantity, settlement_date, status, created_at, updated_at)
        VALUES (#{settlement.settlementId}, #{settlement.account.accountId}, #{settlement.quantity}, CURRENT_DATE, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "settlement.settlementId")
    int insertSettlement(@Param("settlement") Settlement settlement);
    
    /**
     * Selects a settlement by settlement ID.
     * @param settlementId the settlement ID (bound parameter)
     * @return the settlement, or empty if not found
     */
    @Select("""
        SELECT settlement_id, execution_id, demat_account_id, quantity, settlement_date, status, created_at, updated_at
        FROM settlements
        WHERE settlement_id = #{settlementId}
        """)
    @Results({
        @Result(property = "settlementId", column = "settlement_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "execution_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "quantity", column = "quantity"),
        @Result(property = "status", column = "status")
    })
    Optional<Settlement> findSettlementById(@Param("settlementId") Long settlementId);
    
    /**
     * Selects a settlement by execution ID.
     * @param executionId the execution ID (bound parameter)
     * @return the settlement, or empty if not found
     */
    @Select("""
        SELECT settlement_id, execution_id, demat_account_id, quantity, settlement_date, status, created_at, updated_at
        FROM settlements
        WHERE execution_id = #{executionId}
        """)
    @Results({
        @Result(property = "settlementId", column = "settlement_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "execution_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "quantity", column = "quantity"),
        @Result(property = "status", column = "status")
    })
    Optional<Settlement> findSettlementByExecutionId(@Param("executionId") Long executionId);
    
    /**
     * Selects settlements by account ID.
     * @param accountId the account ID (bound parameter)
     * @return list of settlements for the account
     */
    @Select("""
        SELECT settlement_id, execution_id, demat_account_id, quantity, settlement_date, status, created_at, updated_at
        FROM settlements
        WHERE demat_account_id = #{accountId}
        ORDER BY settlement_id
        """)
    @Results({
        @Result(property = "settlementId", column = "settlement_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "execution_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "quantity", column = "quantity"),
        @Result(property = "status", column = "status")
    })
    List<Settlement> findSettlementsByAccountId(@Param("accountId") Long accountId);
    
    /**
     * Selects settlements by status filter.
     * @param status the settlement status (bound parameter)
     * @return list of settlements matching the status
     */
    @Select("""
        SELECT settlement_id, execution_id, demat_account_id, quantity, settlement_date, status, created_at, updated_at
        FROM settlements
        WHERE status = #{status}
        ORDER BY settlement_id
        """)
    @Results({
        @Result(property = "settlementId", column = "settlement_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "execution_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "quantity", column = "quantity"),
        @Result(property = "status", column = "status")
    })
    List<Settlement> findSettlementsByStatus(@Param("status") String status);
    
    /**
     * Selects settlements by settlement date.
     * @param settlementDate the settlement date (bound parameter)
     * @return list of settlements for the date
     */
    @Select("""
        SELECT settlement_id, execution_id, demat_account_id, quantity, settlement_date, status, created_at, updated_at
        FROM settlements
        WHERE settlement_date = #{settlementDate}
        ORDER BY settlement_id
        """)
    @Results({
        @Result(property = "settlementId", column = "settlement_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "execution_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "quantity", column = "quantity"),
        @Result(property = "status", column = "status")
    })
    List<Settlement> findSettlementsByDate(@Param("settlementDate") LocalDate settlementDate);
    
    /**
     * Updates settlement status.
     * @param settlementId the settlement ID (bound parameter)
     * @param status the new status (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE settlements
        SET status = #{status}, updated_at = CURRENT_TIMESTAMP
        WHERE settlement_id = #{settlementId}
        """)
    int updateSettlementStatus(@Param("settlementId") Long settlementId, @Param("status") String status);
}
