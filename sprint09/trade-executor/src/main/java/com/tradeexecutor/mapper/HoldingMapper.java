package com.tradeexecutor.mapper;

import com.tradingsystem.domain.entities.Holding;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * MyBatis mapper for Holding entity (DELIVERY product type holdings in demat account).
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
        INSERT INTO trading.holdings (demat_account_id, instrument_id, quantity, average_price, created_at_date, updated_at)
        VALUES (#{holding.account.accountId}, #{holding.instrument.instrumentId}, #{holding.quantity}, #{holding.averagePrice}, CURRENT_DATE, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "holding.holdingId")
    int insertHolding(@Param("holding") Holding holding);
    
    /**
     * Selects a holding by account ID and instrument ID.
     * @param accountId the account ID (bound parameter)
     * @param instrumentId the instrument ID (bound parameter)
     * @return the holding, or empty if not found
     */
    @Select("""
        SELECT holding_id, demat_account_id, instrument_id, quantity, average_price, created_at_date, updated_at
        FROM trading.holdings
        WHERE demat_account_id = #{accountId} AND instrument_id = #{instrumentId}
        """)
    @ConstructorArgs({
        @Arg(column = "holding_id", javaType = Long.class),
        @Arg(column = "demat_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradeexecutor.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradeexecutor.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "average_price", javaType = BigDecimal.class)
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
        UPDATE trading.holdings
        SET quantity = #{quantity}, average_price = #{averagePrice}, updated_at = CURRENT_TIMESTAMP
        WHERE holding_id = #{holdingId}
        """)
    int updateHolding(@Param("holdingId") Long holdingId, @Param("quantity") int quantity, @Param("averagePrice") BigDecimal averagePrice);
}
