package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.Position;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Position entity.
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 */
@Mapper
public interface PositionMapper {

    @Select("SELECT COALESCE(MAX(position_id), 0) + 1 FROM positions")
    Long nextPositionId();
    
    /**
     * Inserts a new position.
     * @param position the position to insert
     * @return number of rows affected
     */
    @Insert("""
        INSERT INTO positions (position_id, trading_account_id, instrument_id, product_type, quantity, average_price, realized_pnl, position_status, opened_at, updated_at, as_of_date, trade_type)
        VALUES (#{position.positionId}, #{position.account.accountId}, #{position.instrument.instrumentId}, #{position.productType}, #{position.quantity}, #{position.averagePrice}, 0, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_DATE, 'LONG')
        """)
    @Options(useGeneratedKeys = true, keyProperty = "position.positionId")
    int insertPosition(@Param("position") Position position);
    
    /**
     * Selects a position by position ID.
     * @param positionId the position ID (bound parameter)
     * @return the position, or empty if not found
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity, average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE position_id = #{positionId}
        """)
    @Results({
        @Result(property = "positionId", column = "position_id"),
        @Result(property = "account", column = "trading_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "productType", column = "product_type"),
        @Result(property = "averagePrice", column = "average_price"),
        @Result(property = "realizedPnl", column = "realized_pnl"),
        @Result(property = "positionStatus", column = "position_status")
    })
    Optional<Position> findPositionById(@Param("positionId") Long positionId);
    
    /**
     * Selects positions by account ID.
     * This is critical for "account and positions read correctly" test case.
     * @param accountId the account ID (bound parameter)
     * @return list of positions for the account
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity, average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE trading_account_id = #{accountId}
        ORDER BY position_id
        """)
    @ConstructorArgs({
        @Arg(column = "position_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "product_type", javaType = com.tradingsystem.domain.enums.ProductType.class),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "average_price", javaType = BigDecimal.class),
        @Arg(column = "realized_pnl", javaType = BigDecimal.class),
        @Arg(column = "position_status", javaType = String.class),
        @Arg(column = "opened_at", javaType = java.time.LocalDateTime.class),
        @Arg(column = "closed_at", javaType = java.time.LocalDateTime.class),
        @Arg(column = "updated_at", javaType = java.time.LocalDateTime.class)
    })
    List<Position> findPositionsByAccountId(@Param("accountId") Long accountId);
    
    /**
     * Selects positions by instrument ID.
     * @param instrumentId the instrument ID (bound parameter)
     * @return list of positions for the instrument
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity, average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE instrument_id = #{instrumentId}
        ORDER BY position_id
        """)
    @Results({
        @Result(property = "positionId", column = "position_id"),
        @Result(property = "account", column = "trading_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "productType", column = "product_type"),
        @Result(property = "averagePrice", column = "average_price"),
        @Result(property = "realizedPnl", column = "realized_pnl"),
        @Result(property = "positionStatus", column = "position_status")
    })
    List<Position> findPositionsByInstrumentId(@Param("instrumentId") Long instrumentId);
    
    /**
     * Selects open positions for an account.
     * @param accountId the account ID (bound parameter)
     * @return list of open positions for the account
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity, average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE trading_account_id = #{accountId} AND position_status = 'OPEN'
        ORDER BY position_id
        """)
    @Results({
        @Result(property = "positionId", column = "position_id"),
        @Result(property = "account", column = "trading_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "productType", column = "product_type"),
        @Result(property = "averagePrice", column = "average_price"),
        @Result(property = "realizedPnl", column = "realized_pnl"),
        @Result(property = "positionStatus", column = "position_status")
    })
    List<Position> findOpenPositionsByAccountId(@Param("accountId") Long accountId);
    
    /**
     * Updates position quantity and average price.
     * @param positionId the position ID (bound parameter)
     * @param quantity the new quantity (bound parameter)
     * @param averagePrice the new average price (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE positions
        SET quantity = #{quantity}, average_price = #{averagePrice}, updated_at = CURRENT_TIMESTAMP
        WHERE position_id = #{positionId}
        """)
    int updatePosition(@Param("positionId") Long positionId, @Param("quantity") int quantity, @Param("averagePrice") BigDecimal averagePrice);
    
    /**
     * Updates position status to closed.
     * @param positionId the position ID (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE positions
        SET position_status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE position_id = #{positionId}
        """)
    int closePosition(@Param("positionId") Long positionId);
}
