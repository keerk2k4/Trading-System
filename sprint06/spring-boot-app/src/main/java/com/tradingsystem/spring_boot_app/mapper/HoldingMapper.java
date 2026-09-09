package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.Holding;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Holding entity.
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 */
@Mapper
public interface HoldingMapper {
    
    /**
     * Inserts a new holding.
     * @param holding the holding to insert
     * @return number of rows affected
     */
    @Insert("""
        INSERT INTO holdings (demat_account_id, instrument_id, quantity, average_price, created_at, updated_at)
        VALUES (#{holding.account.accountId}, #{holding.instrument.instrumentId}, #{holding.quantity}, #{holding.averagePrice}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "holding.holdingId")
    int insertHolding(@Param("holding") Holding holding);
    
    /**
     * Selects a holding by holding ID.
     * @param holdingId the holding ID (bound parameter)
     * @return the holding, or empty if not found
     */
    @Select("""
        SELECT holding_id, demat_account_id, instrument_id, quantity, average_price, created_at, updated_at
        FROM holdings
        WHERE holding_id = #{holdingId}
        """)
    @Results({
        @Result(property = "holdingId", column = "holding_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "averagePrice", column = "average_price")
    })
    Optional<Holding> findHoldingById(@Param("holdingId") Long holdingId);
    
    /**
     * Selects holdings by account ID.
     * @param accountId the account ID (bound parameter)
     * @return list of holdings for the account
     */
    @Select("""
        SELECT holding_id, demat_account_id, instrument_id, quantity, average_price, created_at, updated_at
        FROM holdings
        WHERE demat_account_id = #{accountId}
        ORDER BY holding_id
        """)
    @Results({
        @Result(property = "holdingId", column = "holding_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "averagePrice", column = "average_price")
    })
    List<Holding> findHoldingsByAccountId(@Param("accountId") Long accountId);
    
    /**
     * Selects a holding by account ID and instrument ID.
     * @param accountId the account ID (bound parameter)
     * @param instrumentId the instrument ID (bound parameter)
     * @return the holding, or empty if not found
     */
    @Select("""
        SELECT holding_id, demat_account_id, instrument_id, quantity, average_price, created_at, updated_at
        FROM holdings
        WHERE demat_account_id = #{accountId} AND instrument_id = #{instrumentId}
        """)
    @Results({
        @Result(property = "holdingId", column = "holding_id"),
        @Result(property = "account", column = "demat_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "averagePrice", column = "average_price")
    })
    Optional<Holding> findHoldingByAccountAndInstrument(@Param("accountId") Long accountId, @Param("instrumentId") Long instrumentId);
    
    /**
     * Updates holding quantity and average price.
     * @param holdingId the holding ID (bound parameter)
     * @param quantity the new quantity (bound parameter)
     * @param averagePrice the new average price (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE holdings
        SET quantity = #{quantity}, average_price = #{averagePrice}, updated_at = CURRENT_TIMESTAMP
        WHERE holding_id = #{holdingId}
        """)
    int updateHolding(@Param("holdingId") Long holdingId, @Param("quantity") int quantity, @Param("averagePrice") BigDecimal averagePrice);
    
    /**
     * Deletes a holding by ID.
     * @param holdingId the holding ID (bound parameter)
     * @return number of rows affected
     */
    @Delete("""
        DELETE FROM holdings
        WHERE holding_id = #{holdingId}
        """)
    int deleteHolding(@Param("holdingId") Long holdingId);
}
