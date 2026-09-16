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
    
    /**
     * Find a position by ID.
     * @param positionId the position ID (bound parameter)
     * @return the position, or empty if not found
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, quantity, average_cost
        FROM positions
        WHERE position_id = #{positionId}
        """)
    Optional<Position> findPositionById(@Param("positionId") Long positionId);
    
    /**
     * Find positions for a trading account.
     * @param accountId the account ID (bound parameter)
     * @return list of positions for the account
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, quantity, average_cost
        FROM positions
        WHERE trading_account_id = #{accountId}
        ORDER BY instrument_id
        """)
    List<Position> findPositionsByAccountId(@Param("accountId") Long accountId);
    
    /**
     * Find a position for a specific account and instrument.
     * @param accountId the account ID (bound parameter)
     * @param instrumentId the instrument ID (bound parameter)
     * @return the position, or empty if not found
     */
    @Select("""
        SELECT position_id, trading_account_id, instrument_id, quantity, average_cost
        FROM positions
        WHERE trading_account_id = #{accountId} AND instrument_id = #{instrumentId}
        """)
    Optional<Position> findPositionByAccountAndInstrument(
        @Param("accountId") Long accountId,
        @Param("instrumentId") Long instrumentId
    );
    
    /**
     * Update position quantity.
     * @param positionId the position ID (bound parameter)
     * @param quantity the new quantity (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE positions
        SET quantity = #{quantity}, updated_at = CURRENT_TIMESTAMP
        WHERE position_id = #{positionId}
        """)
    int updatePositionQuantity(@Param("positionId") Long positionId,
                               @Param("quantity") Long quantity);
    
    /**
     * Update position average cost.
     * @param positionId the position ID (bound parameter)
     * @param averageCost the new average cost (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE positions
        SET average_cost = #{averageCost}, updated_at = CURRENT_TIMESTAMP
        WHERE position_id = #{positionId}
        """)
    int updatePositionAverageCost(@Param("positionId") Long positionId,
                                  @Param("averageCost") BigDecimal averageCost);
}

