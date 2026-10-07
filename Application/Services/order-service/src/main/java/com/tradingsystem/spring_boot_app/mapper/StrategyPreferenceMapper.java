package com.tradingsystem.spring_boot_app.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
public interface StrategyPreferenceMapper {

    record StrategyPreferenceRow(
            Long strategyId,
            Long accountId,
            String symbol,
            String side,
            BigDecimal targetPrice,
            Integer quantity,
            String status,
            String triggeredOrderId,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            LocalDateTime triggeredAt
    ) {
    }

    @Select("SELECT COALESCE(MAX(strategy_id), 0) + 1 FROM trading.strategy_preferences")
    Long nextStrategyId();

    @Insert("""
        INSERT INTO trading.strategy_preferences (
            strategy_id, trading_account_id, symbol, side, target_price, quantity, status,
            created_at, updated_at
        )
        VALUES (
            #{strategyId}, #{accountId}, #{symbol}, #{side}, #{targetPrice}, #{quantity}, 'ACTIVE',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        """)
    int insert(@Param("strategyId") Long strategyId,
               @Param("accountId") Long accountId,
               @Param("symbol") String symbol,
               @Param("side") String side,
               @Param("targetPrice") BigDecimal targetPrice,
               @Param("quantity") Integer quantity);

    @Select("""
        SELECT strategy_id, trading_account_id, symbol, side,
               CAST(target_price AS numeric(18,2)) AS target_price,
               quantity, status, triggered_order_id,
               created_at, updated_at, triggered_at
        FROM trading.strategy_preferences
        WHERE trading_account_id = #{accountId}
        ORDER BY strategy_id DESC
        """)
    List<StrategyPreferenceRow> findByAccountId(@Param("accountId") Long accountId);

    @Select("""
        SELECT strategy_id, trading_account_id, symbol, side,
               CAST(target_price AS numeric(18,2)) AS target_price,
               quantity, status, triggered_order_id,
               created_at, updated_at, triggered_at
        FROM trading.strategy_preferences
        WHERE strategy_id = #{strategyId} AND trading_account_id = #{accountId}
        """)
    Optional<StrategyPreferenceRow> findByIdAndAccountId(@Param("strategyId") Long strategyId,
                                                          @Param("accountId") Long accountId);

    @Update("""
        UPDATE trading.strategy_preferences
        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
        WHERE strategy_id = #{strategyId}
          AND trading_account_id = #{accountId}
          AND status IN ('ACTIVE', 'TRIGGERING')
        """)
    int cancel(@Param("strategyId") Long strategyId, @Param("accountId") Long accountId);

    @Select("""
        SELECT strategy_id, trading_account_id, symbol, side,
               CAST(target_price AS numeric(18,2)) AS target_price,
               quantity, status, triggered_order_id,
               created_at, updated_at, triggered_at
        FROM trading.strategy_preferences
        WHERE symbol = #{symbol}
          AND status = 'ACTIVE'
        """)
    List<StrategyPreferenceRow> findActiveBySymbol(@Param("symbol") String symbol);

    @Update("""
        UPDATE trading.strategy_preferences
        SET status = 'TRIGGERING', updated_at = CURRENT_TIMESTAMP
        WHERE strategy_id = #{strategyId}
          AND status = 'ACTIVE'
        """)
    int markTriggering(@Param("strategyId") Long strategyId);

    @Update("""
        UPDATE trading.strategy_preferences
        SET status = 'TRIGGERED',
            triggered_order_id = #{triggeredOrderId},
            triggered_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE strategy_id = #{strategyId}
          AND status = 'TRIGGERING'
        """)
    int markTriggered(@Param("strategyId") Long strategyId,
                      @Param("triggeredOrderId") String triggeredOrderId);

    @Update("""
        UPDATE trading.strategy_preferences
        SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
        WHERE strategy_id = #{strategyId}
          AND status = 'TRIGGERING'
        """)
    int markActive(@Param("strategyId") Long strategyId);
}
