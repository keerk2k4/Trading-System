package com.tradeexecutor.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * MyBatis Mapper for Position queries.
 * 
 * Used by the market-data poller to discover which symbols are held in positions.
 * Joins positions with instruments table to get ticker symbols.
 */
@Mapper
public interface PositionRepository {

    /**
     * Find all distinct symbols that have open positions (quantity > 0).
     * 
     * Note: After migration 004_align_schema_with_domain_engine.sql:
     * - instruments.ticker_symbol → instruments.symbol
     * - positions.total_quantity → positions.quantity
     * 
     * @return List of distinct symbol strings
     */
    @Select("SELECT DISTINCT i.symbol FROM positions p INNER JOIN instruments i ON p.instrument_id = i.instrument_id WHERE p.quantity > 0")
    List<String> findAllDistinctSymbols();
}

