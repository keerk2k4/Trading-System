package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.Instrument;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Instrument entity.
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 * The symbol parameter is explicitly bound to prevent OWASP A03 SQL injection attacks.
 */
@Mapper
public interface InstrumentMapper {
    
    /**
     * Inserts a new instrument.
     * @param symbol the symbol (bound parameter - prevents SQL injection like "AAPL' OR '1'='1")
     * @param displayName the display name (bound parameter)
     * @param assetClass the asset class (bound parameter)
     * @param quotationCurrency the quotation currency (bound parameter)
     * @return number of rows affected
     */
    @Insert("""
        INSERT INTO instruments (symbol, exchange, isin, company_name, instrument_type, status, created_at, updated_at)
        VALUES (#{symbol}, 'NSE', #{isin}, #{displayName}, 'EQUITY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "instrumentId")
    int insertInstrument(
        @Param("symbol") String symbol,
        @Param("displayName") String displayName,
        @Param("isin") String isin,
        @Param("assetClass") String assetClass
    );
    
    /**
     * Selects an instrument by ID.
     * @param instrumentId the instrument ID (bound parameter)
     * @return the instrument, or empty if not found
     */
    @Select("""
        SELECT instrument_id, symbol, exchange, isin, company_name, instrument_type, status, created_at, updated_at
        FROM instruments
        WHERE instrument_id = #{instrumentId}
        """)
    @Results({
        @Result(property = "instrumentId", column = "instrument_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "displayName", column = "company_name"),
        @Result(property = "assetClass", column = "instrument_type"),
        @Result(property = "quotationCurrency", column = "exchange")
    })
    Optional<Instrument> findInstrumentById(@Param("instrumentId") Long instrumentId);
    
    /**
     * Selects an instrument by symbol.
     * The symbol is explicitly bound as a parameter to prevent SQL injection.
     * Example attack prevention: "AAPL' OR '1'='1" will be safely escaped as a literal string.
     * @param symbol the symbol to search for (bound parameter - CRITICAL for SQL injection prevention)
     * @return the instrument, or empty if not found
     */
    @Select("""
        SELECT instrument_id, symbol, exchange, isin, company_name, instrument_type, status, created_at, updated_at
        FROM instruments
        WHERE symbol = #{symbol}
        """)
    @Results({
        @Result(property = "instrumentId", column = "instrument_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "displayName", column = "company_name"),
        @Result(property = "assetClass", column = "instrument_type"),
        @Result(property = "quotationCurrency", column = "exchange")
    })
    Optional<Instrument> findInstrumentBySymbol(@Param("symbol") String symbol);
    
    /**
     * Selects instruments by status filter.
     * @param status the status filter (bound parameter)
     * @return list of instruments matching the status
     */
    @Select("""
        SELECT instrument_id, symbol, exchange, isin, company_name, instrument_type, status, created_at, updated_at
        FROM instruments
        WHERE status = #{status}
        ORDER BY symbol
        """)
    @Results({
        @Result(property = "instrumentId", column = "instrument_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "displayName", column = "company_name"),
        @Result(property = "assetClass", column = "instrument_type"),
        @Result(property = "quotationCurrency", column = "exchange")
    })
    List<Instrument> findInstrumentsByStatus(@Param("status") String status);
    
    /**
     * Updates instrument status.
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
    
    /**
     * Counts total instruments.
     * @return the count of instruments
     */
    @Select("SELECT COUNT(*) FROM instruments")
    int countInstruments();
}
