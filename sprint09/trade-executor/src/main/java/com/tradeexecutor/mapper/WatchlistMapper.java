package com.tradeexecutor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Minimal watchlist read-model for the market-data poller.
 * The full watchlist CRUD lives in the Trade REST API; the executor only
 * needs the DISTINCT symbol set to union with active-position symbols.
 */
@Mapper
public interface WatchlistMapper {

    @Select("""
        SELECT DISTINCT i.symbol
        FROM trading.watchlist_inst wi
        JOIN trading.instruments i ON i.instrument_id = wi.inst_id
        """)
    List<String> findAllDistinctWatchlistSymbols();
}
