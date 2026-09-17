package com.tradingsystem.spring_boot_app.etl;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for incremental ETL pipeline.
 * 
 * Tests:
 * 1. Incremental load populates FACT_TRADES
 * 2. Second load with no new data adds no rows
 * 3. Invalid rows are dead-lettered
 * 4. Valid rows continue loading after invalid rows
 * 5. No duplicates on re-run with same data
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("Incremental ETL Pipeline Tests")
public class IncrementalTradesETLServiceTest {
    
    @Autowired
    private JdbcTemplate jdbcTemplate;
    
    @Autowired
    private IncrementalTradesETLService etlService;
    
    @BeforeEach
    @Transactional
    void setUp() {
        // Clean up test data
        jdbcTemplate.update("DELETE FROM etl_batch_summary");
        jdbcTemplate.update("DELETE FROM etl_dlt_orders");
        jdbcTemplate.update("DELETE FROM fact_trades");
        jdbcTemplate.update("DELETE FROM dim_date");
        jdbcTemplate.update("DELETE FROM dim_account");
        jdbcTemplate.update("DELETE FROM dim_instrument");
        jdbcTemplate.update("DELETE FROM etl_watermark");
        jdbcTemplate.update("DELETE FROM order_history");
        jdbcTemplate.update("DELETE FROM orders");
        jdbcTemplate.update("DELETE FROM instruments");
        jdbcTemplate.update("DELETE FROM accounts");
        jdbcTemplate.update("DELETE FROM users");
    }
    
    @Test
    @DisplayName("Test 1: Incremental load populates FACT_TRADES and dimensions")
    void testIncrementalLoadPopulatesFacts() {
        // Setup: Create test data
        Long userId = 1L;
        Long accountId = 100L;
        Long instrumentId = 200L;
        Long orderId = 1L;
        
        createTestUser(userId);
        createTestAccount(accountId, userId);
        createTestInstrument(instrumentId);
        createTestOrder(orderId, accountId, instrumentId, "BUY", "FILLED");
        
        // Execute: Run ETL
        IncrementalTradesETLService.BatchResult result = etlService.runIncrementalLoad();
        
        // Verify: Batch result
        assertEquals(1, result.totalRecords);
        assertEquals(1, result.loadedRecords);
        assertEquals(0, result.rejectedRecords);
        
        // Verify: FACT_TRADES populated
        Integer factCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fact_trades WHERE order_id = ?",
            new Object[]{orderId}, Integer.class
        );
        assertEquals(1, factCount, "FACT_TRADES should have 1 record");
        
        // Verify: Dimensions populated
        Integer dimDateCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM dim_date",
            Integer.class
        );
        assertTrue(dimDateCount > 0, "DIM_DATE should be populated");
        
        Integer dimInstrumentCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM dim_instrument WHERE instrument_id = ?",
            new Object[]{instrumentId}, Integer.class
        );
        assertEquals(1, dimInstrumentCount, "DIM_INSTRUMENT should have 1 record");
        
        Integer dimAccountCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM dim_account WHERE account_id = ?",
            new Object[]{accountId}, Integer.class
        );
        assertEquals(1, dimAccountCount, "DIM_ACCOUNT should have 1 record");
    }
    
    @Test
    @DisplayName("Test 2: Second load with no new data adds zero rows")
    void testSecondLoadWithNoNewDataAddsZeroRows() {
        // Setup: Create and load first batch
        Long userId = 1L;
        Long accountId = 100L;
        Long instrumentId = 200L;
        Long orderId = 1L;
        
        createTestUser(userId);
        createTestAccount(accountId, userId);
        createTestInstrument(instrumentId);
        createTestOrder(orderId, accountId, instrumentId, "BUY", "FILLED");
        
        // Execute: First load
        IncrementalTradesETLService.BatchResult result1 = etlService.runIncrementalLoad();
        assertEquals(1, result1.loadedRecords, "First load should load 1 record");
        
        Integer factCountAfterFirstLoad = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fact_trades",
            Integer.class
        );
        assertEquals(1, factCountAfterFirstLoad, "FACT_TRADES should have 1 record after first load");
        
        // Execute: Second load (no new data)
        IncrementalTradesETLService.BatchResult result2 = etlService.runIncrementalLoad();
        assertEquals(0, result2.totalRecords, "Second load should find 0 new records");
        assertEquals(0, result2.loadedRecords, "Second load should load 0 records");
        
        // Verify: No duplicate rows created
        Integer factCountAfterSecondLoad = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fact_trades",
            Integer.class
        );
        assertEquals(1, factCountAfterSecondLoad, "FACT_TRADES should still have 1 record (no duplicates)");
    }
    
    @Test
    @DisplayName("Test 3: Invalid rows are dead-lettered with reason and batch ID")
    void testInvalidRowsAreDeadLettered() {
        // Setup: Create test data with invalid order (missing instrument)
        Long userId = 1L;
        Long accountId = 100L;
        Long instrumentId = 200L;
        Long invalidInstrumentId = 999L;  // Non-existent
        Long orderId1 = 1L;
        Long orderId2 = 2L;
        
        createTestUser(userId);
        createTestAccount(accountId, userId);
        createTestInstrument(instrumentId);
        
        // Create valid order
        createTestOrder(orderId1, accountId, instrumentId, "BUY", "FILLED");
        
        // Create invalid order (references non-existent instrument)
        createTestOrder(orderId2, accountId, invalidInstrumentId, "SELL", "REJECTED");
        
        // Execute: ETL load
        IncrementalTradesETLService.BatchResult result = etlService.runIncrementalLoad();
        
        // Verify: 1 loaded, 1 rejected
        assertEquals(2, result.totalRecords);
        assertEquals(1, result.loadedRecords);
        assertEquals(1, result.rejectedRecords);
        
        // Verify: Valid order in FACT_TRADES
        Integer factCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fact_trades WHERE order_id = ?",
            new Object[]{orderId1}, Integer.class
        );
        assertEquals(1, factCount, "Valid order should be in FACT_TRADES");
        
        // Verify: Invalid order in DLT with reason and batch ID
        List<Map<String, Object>> dltRecords = jdbcTemplate.queryForList(
            "SELECT order_id, failure_reason, batch_id FROM etl_dlt_orders WHERE order_id = ?",
            orderId2
        );
        assertEquals(1, dltRecords.size(), "Invalid order should be in DLT");
        
        Map<String, Object> dltRecord = dltRecords.get(0);
        assertNotNull(dltRecord.get("failure_reason"), "DLT record should have failure reason");
        assertNotNull(dltRecord.get("batch_id"), "DLT record should have batch ID");
        assertTrue(((String) dltRecord.get("failure_reason")).contains("Instrument"),
            "Failure reason should mention instrument");
    }
    
    @Test
    @DisplayName("Test 4: Valid rows continue loading after invalid row")
    void testValidRowsContinueAfterInvalidRow() {
        // Setup: Create 3 orders - valid, invalid, valid
        Long userId = 1L;
        Long accountId = 100L;
        Long instrumentId = 200L;
        Long orderId1 = 1L;
        Long orderId2 = 2L;
        Long orderId3 = 3L;
        
        createTestUser(userId);
        createTestAccount(accountId, userId);
        createTestInstrument(instrumentId);
        
        // Valid order 1
        createTestOrder(orderId1, accountId, instrumentId, "BUY", "FILLED");
        
        // Invalid order (zero quantity) - will be rejected
        jdbcTemplate.update("""
            INSERT INTO orders (
                order_id, idempotency_key, account_id, instrument_id,
                action, type, status, price, quantity, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            orderId2, "KEY2", accountId, instrumentId, "SELL", "MARKET",
            "PENDING", new BigDecimal("100.00"), new BigDecimal("0")  // Invalid: quantity = 0
        );
        
        // Valid order 3
        createTestOrder(orderId3, accountId, instrumentId, "BUY", "FILLED");
        
        // Execute: ETL load
        IncrementalTradesETLService.BatchResult result = etlService.runIncrementalLoad();
        
        // Verify: Both valid orders loaded, invalid rejected
        assertEquals(3, result.totalRecords);
        assertEquals(2, result.loadedRecords);
        assertEquals(1, result.rejectedRecords);
        
        // Verify: Both valid orders in FACT_TRADES
        Integer validOrderCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fact_trades WHERE order_id IN (?, ?)",
            new Object[]{orderId1, orderId3}, Integer.class
        );
        assertEquals(2, validOrderCount, "Both valid orders should be in FACT_TRADES");
        
        // Verify: Invalid order in DLT
        Integer dltCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM etl_dlt_orders WHERE order_id = ?",
            new Object[]{orderId2}, Integer.class
        );
        assertEquals(1, dltCount, "Invalid order should be in DLT");
    }
    
    @Test
    @DisplayName("Test 5: No duplicates on re-run with same data")
    void testNoDuplicatesOnRerun() {
        // Setup: Create order
        Long userId = 1L;
        Long accountId = 100L;
        Long instrumentId = 200L;
        Long orderId = 1L;
        
        createTestUser(userId);
        createTestAccount(accountId, userId);
        createTestInstrument(instrumentId);
        createTestOrder(orderId, accountId, instrumentId, "BUY", "FILLED");
        
        // Execute: First load
        IncrementalTradesETLService.BatchResult result1 = etlService.runIncrementalLoad();
        assertEquals(1, result1.loadedRecords);
        
        // Reset watermark to simulate re-run with same data
        jdbcTemplate.update(
            "UPDATE etl_watermark SET last_processed_timestamp = ? WHERE pipeline_name = ?",
            new java.sql.Timestamp(Instant.EPOCH.toEpochMilli()),
            "FACT_TRADES_INCREMENTAL"
        );
        
        // Execute: Re-run (will see same order again)
        IncrementalTradesETLService.BatchResult result2 = etlService.runIncrementalLoad();
        assertEquals(1, result2.totalRecords, "Re-run should see same order");
        
        // Verify: No duplicate fact rows created
        Integer factCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fact_trades WHERE order_id = ?",
            new Object[]{orderId}, Integer.class
        );
        assertEquals(1, factCount, "Should still have exactly 1 fact row (no duplicates)");
    }
    
    // Helper methods
    
    private void createTestUser(Long userId) {
        jdbcTemplate.update(
            "INSERT INTO users (user_id, user_name, password, email) VALUES (?, ?, ?, ?)",
            userId, "testuser", "pass123", "test@example.com"
        );
    }
    
    private void createTestAccount(Long accountId, Long userId) {
        jdbcTemplate.update(
            "INSERT INTO accounts (account_id, account_num, user_id, balance, status) VALUES (?, ?, ?, ?, ?)",
            accountId, "ACC-" + accountId, userId, new BigDecimal("10000.00"), "ACTIVE"
        );
    }
    
    private void createTestInstrument(Long instrumentId) {
        jdbcTemplate.update(
            "INSERT INTO instruments (instrument_id, ticker_symbol, name, status, price) VALUES (?, ?, ?, ?, ?)",
            instrumentId, "TEST", "Test Stock", "ACTIVE", new BigDecimal("100.00")
        );
    }
    
    private void createTestOrder(Long orderId, Long accountId, Long instrumentId, 
                                String side, String status) {
        jdbcTemplate.update(
            "INSERT INTO orders (order_id, idempotency_key, account_id, instrument_id, " +
            "action, type, status, price, quantity, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            orderId, "KEY-" + orderId, accountId, instrumentId,
            side, "MARKET", status, new BigDecimal("100.00"), new BigDecimal("10")
        );
    }
}
