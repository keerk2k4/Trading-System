package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.spring_boot_app.portfolio.dto.RealisedPnlRow;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

/**
 * The portfolio module's only database access, and it is read-only: nothing
 * here writes to accounts, orders or positions.
 *
 * <p>Realised profit and loss is the sum of what the executor booked on each
 * FILLED SELL at the moment of the sale (orders.realized_pnl, migration 019).
 * It is never recomputed from a current price. from and to are inclusive
 * dates on the fill time; either may be null for an open bound.
 */
@Mapper
public interface PortfolioMapper {

    @Select("""
        <script>
        SELECT i.symbol AS symbol, ROUND(SUM(o.realized_pnl), 2) AS realised_pnl
        FROM trading.orders o
        JOIN trading.instruments i ON i.instrument_id = o.instrument_id
        WHERE o.trading_account_id = #{accountId}
          AND o.side = 'SELL'
          AND o.status = 'FILLED'
          AND o.realized_pnl IS NOT NULL
          <if test="from != null">AND COALESCE(o.filled_at, o.created_at) &gt;= #{from}</if>
          <if test="to != null">AND COALESCE(o.filled_at, o.created_at) &lt; CAST(#{to} AS date) + 1</if>
        GROUP BY i.symbol
        ORDER BY i.symbol
        </script>
        """)
    @ConstructorArgs({
        @Arg(column = "symbol", javaType = String.class),
        @Arg(column = "realised_pnl", javaType = java.math.BigDecimal.class)
    })
    List<RealisedPnlRow> realisedPnlBySymbol(@Param("accountId") long accountId,
                                             @Param("from") LocalDate from,
                                             @Param("to") LocalDate to);

    /** Liveness probe for GET /health. */
    @Select("SELECT 1")
    int ping();
}
