package com.tradingsystem.spring_boot_app.mapper;

import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for the existing trading.watchlist / trading.watchlist_inst
 * tables (see migrations/001_initial_trading_schema.sql and
 * 015_watchlist_defaults.sql). All parameters are bound to prevent SQL injection.
 */
@Mapper
public interface WatchlistMapper {

    record WatchlistRow(Long watchlistId, String userId, String watchlistName, Boolean isDefault) {}

    record WatchlistInstrumentRow(String symbol, String displayName) {}

    @Select("SELECT COALESCE(MAX(watchlist_id), 0) + 1 FROM trading.watchlist")
    Long nextWatchlistId();

    @Select("""
        SELECT watchlist_id, user_id::text AS user_id, watchlist_name, is_default
        FROM trading.watchlist
        WHERE user_id = #{userId}::uuid
        ORDER BY is_default DESC, watchlist_id ASC
        """)
    @ConstructorArgs({
        @Arg(column = "watchlist_id", javaType = Long.class),
        @Arg(column = "user_id", javaType = String.class),
        @Arg(column = "watchlist_name", javaType = String.class),
        @Arg(column = "is_default", javaType = Boolean.class)
    })
    List<WatchlistRow> findWatchlistsByUserId(@Param("userId") String userId);

    @Select("""
        SELECT watchlist_id, user_id::text AS user_id, watchlist_name, is_default
        FROM trading.watchlist
        WHERE watchlist_id = #{watchlistId}
        """)
    @ConstructorArgs({
        @Arg(column = "watchlist_id", javaType = Long.class),
        @Arg(column = "user_id", javaType = String.class),
        @Arg(column = "watchlist_name", javaType = String.class),
        @Arg(column = "is_default", javaType = Boolean.class)
    })
    Optional<WatchlistRow> findWatchlistById(@Param("watchlistId") Long watchlistId);

    @Select("""
        SELECT watchlist_id, user_id::text AS user_id, watchlist_name, is_default
        FROM trading.watchlist
        WHERE user_id = #{userId}::uuid AND is_default = TRUE
        """)
    @ConstructorArgs({
        @Arg(column = "watchlist_id", javaType = Long.class),
        @Arg(column = "user_id", javaType = String.class),
        @Arg(column = "watchlist_name", javaType = String.class),
        @Arg(column = "is_default", javaType = Boolean.class)
    })
    Optional<WatchlistRow> findDefaultWatchlistByUserId(@Param("userId") String userId);

    @Insert("""
        INSERT INTO trading.watchlist (watchlist_id, user_id, watchlist_name, description, created_ts, updated_ts, is_default)
        VALUES (#{watchlistId}, #{userId}::uuid, #{watchlistName}, #{description}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, #{isDefault})
        """)
    int insertWatchlist(@Param("watchlistId") Long watchlistId,
                        @Param("userId") String userId,
                        @Param("watchlistName") String watchlistName,
                        @Param("description") String description,
                        @Param("isDefault") boolean isDefault);

    @Delete("DELETE FROM trading.watchlist WHERE watchlist_id = #{watchlistId}")
    int deleteWatchlist(@Param("watchlistId") Long watchlistId);

    @Select("""
        SELECT i.symbol AS symbol, i.display_name AS display_name
        FROM trading.watchlist_inst wi
        JOIN trading.instruments i ON i.instrument_id = wi.inst_id
        WHERE wi.wlist_id = #{watchlistId}
        ORDER BY i.symbol ASC
        """)
    @ConstructorArgs({
        @Arg(column = "symbol", javaType = String.class),
        @Arg(column = "display_name", javaType = String.class)
    })
    List<WatchlistInstrumentRow> findInstrumentsByWatchlistId(@Param("watchlistId") Long watchlistId);

    @Select("""
        SELECT i.instrument_id
        FROM trading.instruments i
        WHERE i.symbol = #{symbol}
        """)
    Optional<Long> findInstrumentIdBySymbol(@Param("symbol") String symbol);

    @Insert("""
        INSERT INTO trading.watchlist_inst (wlist_id, inst_id)
        VALUES (#{watchlistId}, #{instrumentId})
        ON CONFLICT DO NOTHING
        """)
    int insertWatchlistInstrument(@Param("watchlistId") Long watchlistId,
                                  @Param("instrumentId") Long instrumentId);

    @Delete("""
        DELETE FROM trading.watchlist_inst
        WHERE wlist_id = #{watchlistId} AND inst_id = (
            SELECT instrument_id FROM trading.instruments WHERE symbol = #{symbol}
        )
        """)
    int deleteWatchlistInstrumentBySymbol(@Param("watchlistId") Long watchlistId,
                                          @Param("symbol") String symbol);

    @Delete("DELETE FROM trading.watchlist_inst WHERE wlist_id = #{watchlistId}")
    int deleteAllWatchlistInstruments(@Param("watchlistId") Long watchlistId);

    /**
     * DISTINCT symbols across all user watchlists. Used by the trade-executor
     * market-data poller (unioned with active-position symbols, deduplicated
     * in Java) so watchlist-only stocks are polled exactly once per cycle.
     */
    @Select("""
        SELECT DISTINCT i.symbol
        FROM trading.watchlist_inst wi
        JOIN trading.instruments i ON i.instrument_id = wi.inst_id
        """)
    List<String> findAllDistinctWatchlistSymbols();

    @Select("SELECT price FROM trading.instruments WHERE symbol = #{symbol}")
    Optional<java.math.BigDecimal> findReferencePriceBySymbol(@Param("symbol") String symbol);
}
