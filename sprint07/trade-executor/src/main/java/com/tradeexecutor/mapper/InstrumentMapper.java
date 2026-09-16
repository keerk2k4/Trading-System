package com.tradeexecutor.mapper;

import com.tradingsystem.domain.entities.Instrument;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Instrument entity.
 * Provides database access for instruments in the Trade Executor.
 * All parameters are bound to prevent SQL injection.
 * The symbol parameter is explicitly bound to prevent OWASP A03 SQL injection attacks.
 */
@Mapper
public interface InstrumentMapper {
    
    /**
     * Find an instrument by ID.
     * @param instrumentId the instrument ID (bound parameter)
     * @return the instrument, or empty if not found
     */
    @Select("""
        SELECT instrument_id, symbol, display_name, asset_class, quotation_currency, status
        FROM instruments
        WHERE instrument_id = #{instrumentId}
        """)
    @Results({
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "displayName", column = "display_name"),
        @Result(property = "assetClass", column = "asset_class"),
        @Result(property = "quotationCurrency", column = "quotation_currency")
    })
    @ConstructorArgs({
        @Arg(column = "instrument_id", javaType = Long.class),
        @Arg(column = "symbol", javaType = String.class),
        @Arg(column = "display_name", javaType = String.class),
        @Arg(column = "asset_class", javaType = com.tradingsystem.domain.enums.AssetClass.class),
        @Arg(column = "quotation_currency", javaType = String.class)
    })
    Optional<Instrument> findInstrumentById(@Param("instrumentId") Long instrumentId);
    
    /**
     * Find an instrument by symbol.
     * The symbol is explicitly bound as a parameter to prevent SQL injection.
     * Example attack prevention: "AAPL' OR '1'='1" will be safely escaped as a literal string.
     * @param symbol the symbol to search for (bound parameter - CRITICAL for SQL injection prevention)
     * @return the instrument, or empty if not found
     */
    @Select("""
        SELECT instrument_id, symbol, display_name, asset_class, quotation_currency, status
        FROM instruments
        WHERE symbol = #{symbol}
        """)
    @Results({
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "displayName", column = "display_name"),
        @Result(property = "assetClass", column = "asset_class"),
        @Result(property = "quotationCurrency", column = "quotation_currency")
    })
    @ConstructorArgs({
        @Arg(column = "instrument_id", javaType = Long.class),
        @Arg(column = "symbol", javaType = String.class),
        @Arg(column = "display_name", javaType = String.class),
        @Arg(column = "asset_class", javaType = com.tradingsystem.domain.enums.AssetClass.class),
        @Arg(column = "quotation_currency", javaType = String.class)
    })
    Optional<Instrument> findInstrumentBySymbol(@Param("symbol") String symbol);
    
    /**
     * Find instruments by status.
     * @param status the status filter (bound parameter)
     * @return list of instruments matching the status
     */
    @Select("""
        SELECT instrument_id, symbol, display_name, asset_class, quotation_currency, status
        FROM instruments
        WHERE status = #{status}
        ORDER BY symbol
        """)
    @Results({
        @Result(property = "instrumentId", column = "instrument_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "displayName", column = "display_name"),
        @Result(property = "assetClass", column = "asset_class"),
        @Result(property = "quotationCurrency", column = "quotation_currency")
    })
    List<Instrument> findInstrumentsByStatus(@Param("status") String status);
    
    /**
     * Update instrument status.
     * @param instrumentId the instrument ID (bound parameter)
     * @param status the new status (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE instruments
        SET status = #{status}, updated_at = CURRENT_TIMESTAMP
        WHERE instrument_id = #{instrumentId}
        """)
    int updateInstrumentStatus(@Param("instrumentId") Long instrumentId, @Param("status") String status);
}

