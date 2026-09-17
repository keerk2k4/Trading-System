package com.tradingsystem.spring_boot_app.etl;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Incremental ETL service for loading trade data into DuckDB analytics warehouse.
 * 
 * Implements:
 * - Reads operational data from PostgreSQL
 * - Writes analytics data to DuckDB
 * - Watermark-based incremental loading (order creation timestamp)
 * - Data quality validation with dead-lettering
 * - MERGE/upsert semantics to prevent duplicates
 * - Dimension loading (DIM_DATE, DIM_INSTRUMENT, DIM_ACCOUNT)
 * - Fact loading into FACT_TRADES
 * 
 * Process:
 * 1. Read watermark from DuckDB (last processed created_at timestamp)
 * 2. Load orders after watermark from PostgreSQL
 * 3. Load dimensions into DuckDB for data in the batch
 * 4. Validate each order and INSERT/UPDATE into DuckDB FACT_TRADES or DLT
 * 5. Update watermark in DuckDB on batch completion
 */
@Service
public class IncrementalTradesETLService {
    
    private static final Logger logger = LoggerFactory.getLogger(IncrementalTradesETLService.class);
    
    private static final String PIPELINE_NAME = "FACT_TRADES_INCREMENTAL";
    private static final int DEFAULT_BATCH_SIZE = 1000;
    
    private final JdbcTemplate postgresJdbcTemplate;  // For reading from operational database
    private final JdbcTemplate warehouseJdbcTemplate; // For writing to DuckDB warehouse
    
    public IncrementalTradesETLService(
            JdbcTemplate jdbcTemplate,
            @Qualifier("warehouseJdbcTemplate") JdbcTemplate warehouseJdbcTemplate) {
        this.postgresJdbcTemplate = jdbcTemplate;
        this.warehouseJdbcTemplate = warehouseJdbcTemplate;
    }
    
    /**
     * Initialize DuckDB warehouse schema on service startup.
     * Creates all tables if they don't already exist.
     */
    @PostConstruct
    public void initializeWarehouse() {
        try {
            logger.info("Initializing DuckDB warehouse schema...");
            
            // Create all tables if they don't exist
            createTableIfNotExists("etl_watermark", """
                CREATE TABLE IF NOT EXISTS etl_watermark (
                    pipeline_name VARCHAR(100) PRIMARY KEY,
                    last_processed_timestamp TIMESTAMP,
                    last_update_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    batch_id VARCHAR(100),
                    status VARCHAR(20) DEFAULT 'ACTIVE'
                )
                """);
            
            createTableIfNotExists("dim_date", """
                CREATE TABLE IF NOT EXISTS dim_date (
                    date_key BIGINT PRIMARY KEY,
                    full_date DATE UNIQUE,
                    year INTEGER, month INTEGER, day INTEGER, quarter INTEGER,
                    week_of_year INTEGER, day_of_week INTEGER,
                    day_name VARCHAR(20), month_name VARCHAR(20),
                    is_weekend BOOLEAN
                )
                """);
            
            createTableIfNotExists("dim_instrument", """
                CREATE TABLE IF NOT EXISTS dim_instrument (
                    instrument_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    instrument_id BIGINT UNIQUE NOT NULL,
                    ticker_symbol VARCHAR(20),
                    instrument_name VARCHAR(255),
                    instrument_status VARCHAR(50),
                    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    effective_to TIMESTAMP,
                    is_current BOOLEAN DEFAULT true
                )
                """);
            
            createTableIfNotExists("dim_account", """
                CREATE TABLE IF NOT EXISTS dim_account (
                    account_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    account_id BIGINT UNIQUE NOT NULL,
                    account_num VARCHAR(50),
                    user_id BIGINT,
                    account_status VARCHAR(50),
                    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    effective_to TIMESTAMP,
                    is_current BOOLEAN DEFAULT true
                )
                """);
            
            createTableIfNotExists("fact_trades", """
                CREATE TABLE IF NOT EXISTS fact_trades (
                    trade_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    order_id BIGINT UNIQUE NOT NULL,
                    date_key BIGINT NOT NULL,
                    instrument_key BIGINT NOT NULL,
                    account_key BIGINT NOT NULL,
                    side VARCHAR(10) CHECK (side IN ('BUY', 'SELL')),
                    quantity DECIMAL(19, 4) NOT NULL CHECK (quantity > 0),
                    price DECIMAL(19, 4) NOT NULL CHECK (price > 0),
                    trade_value DECIMAL(19, 4) NOT NULL CHECK (trade_value > 0),
                    order_status VARCHAR(50),
                    created_date_key BIGINT,
                    batch_id VARCHAR(100),
                    loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (date_key) REFERENCES dim_date(date_key),
                    FOREIGN KEY (instrument_key) REFERENCES dim_instrument(instrument_key),
                    FOREIGN KEY (account_key) REFERENCES dim_account(account_key)
                )
                """);
            
            createTableIfNotExists("etl_dlt_orders", """
                CREATE TABLE IF NOT EXISTS etl_dlt_orders (
                    dlt_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    order_id BIGINT NOT NULL,
                    account_id BIGINT,
                    instrument_id BIGINT,
                    side VARCHAR(10),
                    quantity DECIMAL(19, 4),
                    price DECIMAL(19, 4),
                    order_status VARCHAR(50),
                    created_at TIMESTAMP,
                    failure_reason VARCHAR(500) NOT NULL,
                    batch_id VARCHAR(100) NOT NULL,
                    original_data VARCHAR(1000),
                    dlt_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);
            
            createTableIfNotExists("etl_batch_summary", """
                CREATE TABLE IF NOT EXISTS etl_batch_summary (
                    batch_id VARCHAR(100) PRIMARY KEY,
                    pipeline_name VARCHAR(100) NOT NULL,
                    watermark_start TIMESTAMP,
                    watermark_end TIMESTAMP,
                    records_processed INTEGER DEFAULT 0,
                    records_loaded INTEGER DEFAULT 0,
                    records_rejected INTEGER DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'IN_PROGRESS',
                    error_message VARCHAR(500),
                    start_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_timestamp TIMESTAMP
                )
                """);
            
            logger.info("DuckDB warehouse schema initialized successfully");
        } catch (Exception e) {
            logger.warn("Error initializing warehouse schema (may already exist): {}", e.getMessage());
        }
    }
    
    /**
     * Create a table if it doesn't exist (idempotent).
     */
    private void createTableIfNotExists(String tableName, String createTableSql) {
        try {
            warehouseJdbcTemplate.execute(createTableSql);
            logger.debug("Table {} ensured to exist", tableName);
        } catch (Exception e) {
            logger.debug("Table {} creation skipped: {}", tableName, e.getMessage());
        }
    }
    
    /**
     * Run one incremental load cycle.
     * 
     * @return BatchResult containing summary of loaded/rejected records
     */
    @Transactional
    public BatchResult runIncrementalLoad() {
        String batchId = generateBatchId();
        logger.info("Starting ETL batch: {}", batchId);
        
        try {
            // Step 1: Get or create watermark
            Instant watermarkStart = getWatermark();
            logger.info("Watermark start: {}", watermarkStart);
            
            // Step 2: Fetch orders since watermark
            List<OrderRecord> ordersToLoad = fetchOrdersSinceWatermark(watermarkStart);
            logger.info("Fetched {} orders for processing", ordersToLoad.size());
            
            if (ordersToLoad.isEmpty()) {
                logger.info("No new orders to process. Batch {} complete.", batchId);
                updateBatchSummary(batchId, PIPELINE_NAME, watermarkStart, watermarkStart, 
                    0, 0, 0, "SUCCESS", null);
                return new BatchResult(batchId, 0, 0, 0);
            }
            
            // Step 3: Determine date range and load dimensions
            LocalDate minDate = ordersToLoad.stream()
                .map(o -> o.createdAt.toInstant().atZone(ZoneId.systemDefault()).toLocalDate())
                .min(LocalDate::compareTo)
                .orElse(LocalDate.now());
            
            LocalDate maxDate = ordersToLoad.stream()
                .map(o -> o.createdAt.toInstant().atZone(ZoneId.systemDefault()).toLocalDate())
                .max(LocalDate::compareTo)
                .orElse(LocalDate.now());
            
            logger.info("Date range for dimension load: {} to {}", minDate, maxDate);
            
            // Load dimensions
            loadDimDate(minDate, maxDate);
            loadDimInstrument(ordersToLoad);
            loadDimAccount(ordersToLoad);
            
            // Step 4: Process each order
            int recordsLoaded = 0;
            int recordsRejected = 0;
            Instant maxProcessedTimestamp = watermarkStart;
            
            for (OrderRecord order : ordersToLoad) {
                List<String> validationErrors = validateOrder(order);
                
                if (validationErrors.isEmpty()) {
                    // Valid order - MERGE into FACT_TRADES
                    if (insertOrUpdateFactTrade(order, batchId)) {
                        recordsLoaded++;
                        maxProcessedTimestamp = order.createdAt.toInstant()
                            .isAfter(maxProcessedTimestamp) ? order.createdAt.toInstant() : maxProcessedTimestamp;
                    }
                } else {
                    // Invalid order - dead-letter with reason
                    String failureReason = String.join("; ", validationErrors);
                    insertDeadLetter(order, failureReason, batchId);
                    recordsRejected++;
                    logger.warn("Rejected order {}: {}", order.orderId, failureReason);
                }
            }
            
            // Step 5: Update watermark to prevent re-processing
            updateWatermark(maxProcessedTimestamp, batchId);
            
            // Step 6: Update batch summary
            updateBatchSummary(batchId, PIPELINE_NAME, watermarkStart, maxProcessedTimestamp,
                ordersToLoad.size(), recordsLoaded, recordsRejected, "SUCCESS", null);
            
            logger.info("Batch {} complete: {} loaded, {} rejected", 
                batchId, recordsLoaded, recordsRejected);
            
            return new BatchResult(batchId, ordersToLoad.size(), recordsLoaded, recordsRejected);
            
        } catch (Exception e) {
            logger.error("ETL batch {} failed with error: {}", batchId, e.getMessage(), e);
            updateBatchSummary(batchId, PIPELINE_NAME, null, null, 0, 0, 0, 
                "FAILED", e.getMessage());
            throw new ETLException("Batch " + batchId + " failed", e);
        }
    }
    
    /**
     * Fetch orders created after watermark timestamp from PostgreSQL.
     */
    private List<OrderRecord> fetchOrdersSinceWatermark(Instant watermark) {
        String sql = """
            SELECT o.order_id, o.account_id, o.instrument_id, o.action, 
                   o.type, o.status, o.price, o.quantity, o.created_at
            FROM orders o
            WHERE o.created_at > ?
            ORDER BY o.created_at ASC
            LIMIT ?
            """;
        
        return postgresJdbcTemplate.query(sql, 
            new Object[]{new java.sql.Timestamp(watermark.toEpochMilli()), DEFAULT_BATCH_SIZE},
            (rs, rowNum) -> new OrderRecord(
                rs.getLong("order_id"),
                rs.getLong("account_id"),
                rs.getLong("instrument_id"),
                rs.getString("action"),
                rs.getString("type"),
                rs.getString("status"),
                rs.getBigDecimal("price"),
                rs.getBigDecimal("quantity"),
                rs.getTimestamp("created_at")
            )
        );
    }
    
    /**
     * Load or update date dimension in DuckDB for date range.
     */
    private void loadDimDate(LocalDate startDate, LocalDate endDate) {
        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            long dateKey = current.getYear() * 10000L + current.getMonthValue() * 100L + current.getDayOfMonth();
            
            String checkSql = "SELECT COUNT(*) FROM dim_date WHERE date_key = ?";
            Integer count = warehouseJdbcTemplate.queryForObject(checkSql, new Object[]{dateKey}, Integer.class);
            
            if (count == 0) {
                String insertSql = """
                    INSERT INTO dim_date (
                        date_key, full_date, year, month, day, quarter, 
                        week_of_year, day_of_week, day_name, month_name, is_weekend
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """;
                
                int quarter = (current.getMonthValue() - 1) / 3 + 1;
                int weekOfYear = current.get(java.time.temporal.WeekFields.ISO.weekOfYear());
                int dayOfWeek = current.getDayOfWeek().getValue() % 7;
                boolean isWeekend = dayOfWeek == 0 || dayOfWeek == 6;
                
                warehouseJdbcTemplate.update(insertSql,
                    dateKey,
                    java.sql.Date.valueOf(current),
                    current.getYear(),
                    current.getMonthValue(),
                    current.getDayOfMonth(),
                    quarter,
                    weekOfYear,
                    dayOfWeek,
                    current.getDayOfWeek().toString(),
                    current.getMonth().toString(),
                    isWeekend
                );
            }
            
            current = current.plusDays(1);
        }
    }
    
    /**
     * Load or update instrument dimension in DuckDB for orders in batch.
     */
    private void loadDimInstrument(List<OrderRecord> orders) {
        Set<Long> instrumentIds = new HashSet<>();
        for (OrderRecord order : orders) {
            instrumentIds.add(order.instrumentId);
        }
        
        for (Long instrumentId : instrumentIds) {
            String checkSql = "SELECT COUNT(*) FROM dim_instrument WHERE instrument_id = ?";
            Integer count = warehouseJdbcTemplate.queryForObject(checkSql, new Object[]{instrumentId}, Integer.class);
            
            if (count == 0) {
                // Fetch from PostgreSQL source and insert into DuckDB
                String sourceSql = """
                    SELECT instrument_id, ticker_symbol, name, status
                    FROM instruments WHERE instrument_id = ?
                    """;
                
                List<Map<String, Object>> results = postgresJdbcTemplate.queryForList(sourceSql, instrumentId);
                if (!results.isEmpty()) {
                    Map<String, Object> row = results.get(0);
                    String insertSql = """
                        INSERT INTO dim_instrument (
                            instrument_id, ticker_symbol, instrument_name, instrument_status
                        ) VALUES (?, ?, ?, ?)
                        """;
                    
                    warehouseJdbcTemplate.update(insertSql,
                        row.get("instrument_id"),
                        row.get("ticker_symbol"),
                        row.get("name"),
                        row.get("status")
                    );
                }
            }
        }
    }
    
    /**
     * Load or update account dimension in DuckDB for orders in batch.
     */
    private void loadDimAccount(List<OrderRecord> orders) {
        Set<Long> accountIds = new HashSet<>();
        for (OrderRecord order : orders) {
            accountIds.add(order.accountId);
        }
        
        for (Long accountId : accountIds) {
            String checkSql = "SELECT COUNT(*) FROM dim_account WHERE account_id = ?";
            Integer count = warehouseJdbcTemplate.queryForObject(checkSql, new Object[]{accountId}, Integer.class);
            
            if (count == 0) {
                // Fetch from PostgreSQL source and insert into DuckDB
                String sourceSql = """
                    SELECT account_id, account_num, user_id, status
                    FROM accounts WHERE account_id = ?
                    """;
                
                List<Map<String, Object>> results = postgresJdbcTemplate.queryForList(sourceSql, accountId);
                if (!results.isEmpty()) {
                    Map<String, Object> row = results.get(0);
                    String insertSql = """
                        INSERT INTO dim_account (
                            account_id, account_num, user_id, account_status
                        ) VALUES (?, ?, ?, ?)
                        """;
                    
                    warehouseJdbcTemplate.update(insertSql,
                        row.get("account_id"),
                        row.get("account_num"),
                        row.get("user_id"),
                        row.get("status")
                    );
                }
            }
        }
    }
    
    /**
     * Validate order data quality against warehouse dimensions.
     * 
     * @return List of validation error messages (empty if valid)
     */
    private List<String> validateOrder(OrderRecord order) {
        List<String> errors = new ArrayList<>();
        
        // Check account exists in dimension (query DuckDB warehouse)
        String accountCheckSql = "SELECT COUNT(*) FROM dim_account WHERE account_id = ?";
        Integer accountCount = warehouseJdbcTemplate.queryForObject(accountCheckSql, 
            new Object[]{order.accountId}, Integer.class);
        if (accountCount == 0) {
            errors.add("Account " + order.accountId + " not found in DIM_ACCOUNT");
        }
        
        // Check instrument exists in dimension (query DuckDB warehouse)
        String instrumentCheckSql = "SELECT COUNT(*) FROM dim_instrument WHERE instrument_id = ?";
        Integer instrumentCount = warehouseJdbcTemplate.queryForObject(instrumentCheckSql,
            new Object[]{order.instrumentId}, Integer.class);
        if (instrumentCount == 0) {
            errors.add("Instrument " + order.instrumentId + " not found in DIM_INSTRUMENT");
        }
        
        // Check quantity is positive
        if (order.quantity == null || order.quantity.compareTo(BigDecimal.ZERO) <= 0) {
            errors.add("Quantity must be positive, got: " + order.quantity);
        }
        
        // Check price is positive
        if (order.price == null || order.price.compareTo(BigDecimal.ZERO) <= 0) {
            errors.add("Price must be positive, got: " + order.price);
        }
        
        // Check side is valid (BUY/SELL)
        if (order.side == null || (!order.side.equals("BUY") && !order.side.equals("SELL"))) {
            errors.add("Side must be BUY or SELL, got: " + order.side);
        }
        
        // Check status is valid
        Set<String> validStatuses = Set.of("PENDING", "FILLED", "CANCELLED", "REJECTED", "EXPIRED");
        if (order.status == null || !validStatuses.contains(order.status)) {
            errors.add("Status must be one of " + validStatuses + ", got: " + order.status);
        }
        
        // Check trade value
        if (order.quantity != null && order.price != null) {
            BigDecimal expectedTradeValue = order.quantity.multiply(order.price);
            // Trade value validation is informational - value is recalculated
        }
        
        return errors;
    }
    
    /**
     * Insert or update fact record in DuckDB (idempotent).
     * Uses DELETE then INSERT pattern for idempotence in DuckDB.
     * On re-run with same data, DELETE removes old row and INSERT adds it back.
     * 
     * @return true if inserted/updated, false if dimension keys missing
     */
    private boolean insertOrUpdateFactTrade(OrderRecord order, String batchId) {
        // Get dimension keys from DuckDB warehouse
        Long instrumentKey = getInstrumentKey(order.instrumentId);
        Long accountKey = getAccountKey(order.accountId);
        Long dateKey = getDateKey(order.createdAt);
        
        if (instrumentKey == null || accountKey == null || dateKey == null) {
            logger.warn("Missing dimension keys for order {}", order.orderId);
            return false;
        }
        
        // Calculate trade value
        BigDecimal tradeValue = order.quantity.multiply(order.price);
        
        try {
            // For idempotence: delete existing row if present, then insert
            String deleteSql = "DELETE FROM fact_trades WHERE order_id = ?";
            warehouseJdbcTemplate.update(deleteSql, order.orderId);
            
            // Now insert the (potentially updated) row
            String insertSql = """
                INSERT INTO fact_trades (
                    order_id, date_key, instrument_key, account_key, side, quantity, 
                    price, trade_value, order_status, created_date_key, batch_id, loaded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """;
            
            warehouseJdbcTemplate.update(insertSql,
                order.orderId, dateKey, instrumentKey, accountKey,
                order.side, order.quantity, order.price, tradeValue,
                order.status, dateKey, batchId
            );
            return true;
        } catch (Exception e) {
            logger.error("Failed to insert/update fact_trades for order {}: {}", 
                order.orderId, e.getMessage());
            return false;
        }
    }
    
    /**
     * Insert rejected order into DuckDB dead-letter table.
     */
    private void insertDeadLetter(OrderRecord order, String failureReason, String batchId) {
        String sql = """
            INSERT INTO etl_dlt_orders (
                order_id, account_id, instrument_id, side, quantity, price,
                order_status, created_at, failure_reason, batch_id, original_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;
        
        String originalData = String.format(
            "{order_id=%d, account_id=%d, instrument_id=%d, side=%s, quantity=%s, price=%s, status=%s}",
            order.orderId, order.accountId, order.instrumentId,
            order.side, order.quantity, order.price, order.status
        );
        
        try {
            warehouseJdbcTemplate.update(sql,
                order.orderId, order.accountId, order.instrumentId,
                order.side, order.quantity, order.price,
                order.status, order.createdAt, failureReason, batchId, originalData
            );
        } catch (Exception e) {
            logger.error("Failed to insert dead-letter for order {}: {}", 
                order.orderId, e.getMessage());
        }
    }
    
    /**
     * Get watermark (last processed timestamp) from DuckDB.
     * Initialize to epoch if not found.
     */
    private Instant getWatermark() {
        String sql = """
            SELECT last_processed_timestamp
            FROM etl_watermark
            WHERE pipeline_name = ?
            """;
        
        try {
            java.sql.Timestamp ts = warehouseJdbcTemplate.queryForObject(sql, 
                new Object[]{PIPELINE_NAME}, java.sql.Timestamp.class);
            return ts != null ? ts.toInstant() : Instant.EPOCH;
        } catch (Exception e) {
            logger.debug("Watermark not found, initializing to EPOCH");
            return Instant.EPOCH;
        }
    }
    
    /**
     * Update watermark in DuckDB after successful batch.
     */
    private void updateWatermark(Instant timestamp, String batchId) {
        String checkSql = "SELECT COUNT(*) FROM etl_watermark WHERE pipeline_name = ?";
        Integer count = warehouseJdbcTemplate.queryForObject(checkSql, 
            new Object[]{PIPELINE_NAME}, Integer.class);
        
        if (count == 0) {
            String insertSql = """
                INSERT INTO etl_watermark (
                    pipeline_name, last_processed_timestamp, batch_id, status
                ) VALUES (?, ?, ?, ?)
                """;
            warehouseJdbcTemplate.update(insertSql, PIPELINE_NAME, 
                new java.sql.Timestamp(timestamp.toEpochMilli()), batchId, "ACTIVE");
        } else {
            String updateSql = """
                UPDATE etl_watermark
                SET last_processed_timestamp = ?, 
                    last_update_timestamp = CURRENT_TIMESTAMP,
                    batch_id = ?
                WHERE pipeline_name = ?
                """;
            warehouseJdbcTemplate.update(updateSql, 
                new java.sql.Timestamp(timestamp.toEpochMilli()), batchId, PIPELINE_NAME);
        }
    }
    
    /**
     * Update batch summary in DuckDB.
     */
    private void updateBatchSummary(String batchId, String pipelineName, Instant startTs, 
                                   Instant endTs, int recordsProcessed, int recordsLoaded,
                                   int recordsRejected, String status, String errorMsg) {
        String sql = """
            INSERT INTO etl_batch_summary (
                batch_id, pipeline_name, watermark_start, watermark_end,
                records_processed, records_loaded, records_rejected, status, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;
        
        try {
            warehouseJdbcTemplate.update(sql,
                batchId, pipelineName,
                startTs != null ? new java.sql.Timestamp(startTs.toEpochMilli()) : null,
                endTs != null ? new java.sql.Timestamp(endTs.toEpochMilli()) : null,
                recordsProcessed, recordsLoaded, recordsRejected, status, errorMsg
            );
        } catch (Exception e) {
            logger.warn("Failed to update batch summary: {}", e.getMessage());
        }
    }
    
    /**
     * Get instrument key from DuckDB dimension.
     */
    private Long getInstrumentKey(Long instrumentId) {
        String sql = "SELECT instrument_key FROM dim_instrument WHERE instrument_id = ?";
        try {
            return warehouseJdbcTemplate.queryForObject(sql, new Object[]{instrumentId}, Long.class);
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * Get account key from DuckDB dimension.
     */
    private Long getAccountKey(Long accountId) {
        String sql = "SELECT account_key FROM dim_account WHERE account_id = ?";
        try {
            return warehouseJdbcTemplate.queryForObject(sql, new Object[]{accountId}, Long.class);
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * Get date key from dimension.
     */
    private Long getDateKey(java.sql.Timestamp timestamp) {
        LocalDate date = timestamp.toLocalDateTime().toLocalDate();
        long dateKey = date.getYear() * 10000L + date.getMonthValue() * 100L + date.getDayOfMonth();
        return dateKey;
    }
    
    /**
     * Generate unique batch ID.
     */
    private String generateBatchId() {
        return "BATCH_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8);
    }
    
    /**
     * Order record from source.
     */
    private static class OrderRecord {
        Long orderId;
        Long accountId;
        Long instrumentId;
        String side;  // "BUY" or "SELL" (mapped from "action")
        String type;
        String status;
        BigDecimal price;
        BigDecimal quantity;
        java.sql.Timestamp createdAt;
        
        OrderRecord(Long orderId, Long accountId, Long instrumentId, String action,
                   String type, String status, BigDecimal price, BigDecimal quantity,
                   java.sql.Timestamp createdAt) {
            this.orderId = orderId;
            this.accountId = accountId;
            this.instrumentId = instrumentId;
            this.side = action;  // "action" column is actually side (BUY/SELL)
            this.type = type;
            this.status = status;
            this.price = price;
            this.quantity = quantity;
            this.createdAt = createdAt;
        }
    }
    
    /**
     * Result of batch execution.
     */
    public static class BatchResult {
        public final String batchId;
        public final int totalRecords;
        public final int loadedRecords;
        public final int rejectedRecords;
        
        public BatchResult(String batchId, int totalRecords, int loadedRecords, int rejectedRecords) {
            this.batchId = batchId;
            this.totalRecords = totalRecords;
            this.loadedRecords = loadedRecords;
            this.rejectedRecords = rejectedRecords;
        }
    }
    
    /**
     * Exception for ETL failures.
     */
    public static class ETLException extends RuntimeException {
        public ETLException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
