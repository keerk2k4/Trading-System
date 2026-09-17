package com.tradeexecutor.mapper;

import com.tradingsystem.domain.entities.Position;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Position entity.
 * Provides database access for positions in the Trade Executor.
 * All parameters are bound to prevent SQL injection.
 */
@Mapper
public interface PositionMapper {

    @Select("SELECT COALESCE(MAX(position_id), 0) + 1 FROM positions")
    Long nextPositionId();

    /**
     * Insert a new position.
     */
    @Insert("""
        INSERT INTO positions (position_id, trading_account_id, instrument_id, product_type, quantity,
                               average_price, realized_pnl, position_status, opened_at, updated_at,
                               as_of_date, trade_type)
        VALUES (#{position.positionId}, #{position.account.accountId}, #{position.instrument.instrumentId},
                #{position.productType}, #{position.quantity}, #{position.averagePrice}, #{position.realizedPnl},
                #{position.positionStatus}, #{position.openedAt}, #{position.updatedAt}, CURRENT_DATE, 'LONG')
        """)
    int insertPosition(@Param("position") Position position);
    
    /**
     * Find a position by ID.
     * @param positionId the position ID (bound parameter)
     * @return the position, or empty if not found
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity,
               average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE position_id = #{positionId}
        """)
    @ConstructorArgs({
        @Arg(column = "position_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradeexecutor.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradeexecutor.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "product_type", javaType = com.tradingsystem.domain.enums.ProductType.class),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "average_price", javaType = BigDecimal.class),
        @Arg(column = "realized_pnl", javaType = BigDecimal.class),
        @Arg(column = "position_status", javaType = String.class),
        @Arg(column = "opened_at", javaType = java.time.LocalDateTime.class),
        @Arg(column = "closed_at", javaType = java.time.LocalDateTime.class),
        @Arg(column = "updated_at", javaType = java.time.LocalDateTime.class)
    })
    Optional<Position> findPositionById(@Param("positionId") Long positionId);
    
    /**
     * Find positions for a trading account.
     * @param accountId the account ID (bound parameter)
     * @return list of positions for the account
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity,
               average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE trading_account_id = #{accountId}
        ORDER BY instrument_id
        """)
    @ConstructorArgs({
        @Arg(column = "position_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradeexecutor.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradeexecutor.mapper.InstrumentMapper.findInstrumentById"),
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
     * Find a position for a specific account and instrument.
     * @param accountId the account ID (bound parameter)
     * @param instrumentId the instrument ID (bound parameter)
     * @return the position, or empty if not found
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, product_type, quantity,
               average_price, realized_pnl, position_status, opened_at, closed_at, updated_at
        FROM positions
        WHERE trading_account_id = #{accountId} AND instrument_id = #{instrumentId}
        """)
    @ConstructorArgs({
        @Arg(column = "position_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradeexecutor.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradeexecutor.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "product_type", javaType = com.tradingsystem.domain.enums.ProductType.class),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "average_price", javaType = BigDecimal.class),
        @Arg(column = "realized_pnl", javaType = BigDecimal.class),
        @Arg(column = "position_status", javaType = String.class),
        @Arg(column = "opened_at", javaType = java.time.LocalDateTime.class),
        @Arg(column = "closed_at", javaType = java.time.LocalDateTime.class),
        @Arg(column = "updated_at", javaType = java.time.LocalDateTime.class)
    })
    Optional<Position> findPositionByAccountAndInstrument(
        @Param("accountId") Long accountId,
        @Param("instrumentId") Long instrumentId
    );
    
    /**
     * Update position quantity and average price in one statement.
     */
    @Update("""
        UPDATE positions
        SET quantity = #{quantity}, average_price = #{averagePrice}, updated_at = CURRENT_TIMESTAMP
        WHERE position_id = #{positionId}
        """)
    int updatePosition(@Param("positionId") Long positionId,
                       @Param("quantity") int quantity,
                       @Param("averagePrice") BigDecimal averagePrice);
    
    /**
     * Find all distinct symbols that have open positions (quantity > 0).
     * Used by the market-data poller to discover which symbols to poll.
     * 
     * @return List of distinct symbol strings
     */
    @Select("""
        SELECT DISTINCT i.symbol FROM positions p 
        INNER JOIN instruments i ON p.instrument_id = i.instrument_id 
        WHERE p.quantity > 0
        """)
    List<String> findAllDistinctSymbols();
}

