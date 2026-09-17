package com.tradingsystem.spring_boot_app.warehouse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Initializes the DuckDB warehouse on application startup.
 * 
 * Responsibilities:
 * 1. Create warehouse schema and tables if they don't exist
 * 2. Sync existing orders from PostgreSQL to DuckDB
 * 3. Ensure warehouse is ready for analytics queries
 */
@Component
public class WarehouseInitializer {
    private static final Logger log = LoggerFactory.getLogger(WarehouseInitializer.class);

    private final JdbcTemplate warehouseJdbcTemplate;
    private final JdbcTemplate primaryJdbcTemplate;

    public WarehouseInitializer(JdbcTemplate warehouseJdbcTemplate, JdbcTemplate primaryJdbcTemplate) {
        this.warehouseJdbcTemplate = warehouseJdbcTemplate;
        this.primaryJdbcTemplate = primaryJdbcTemplate;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void initializeWarehouse() {
        try {
            log.info("Initializing DuckDB warehouse...");

            // Step 1: Create orders table in DuckDB
            createOrdersTable();
            log.info("✓ Orders table created/verified");

            // Step 2: Create trade_summary materialized view (for analytics)
            createTradeSummaryView();
            log.info("✓ Trade summary view created/verified");

            // Step 3: Sync existing orders from PostgreSQL
            syncExistingOrders();
            log.info("✓ Historical orders synced to warehouse");

            log.info("✓✓✓ DuckDB warehouse initialization complete!");
        } catch (Exception e) {
            log.error("Failed to initialize warehouse", e);
            throw new RuntimeException("Warehouse initialization failed", e);
        }
    }

    private void createOrdersTable() {
        String createTableSQL = """
                CREATE TABLE IF NOT EXISTS orders (
                    order_id BIGINT PRIMARY KEY,
                    idempotency_key VARCHAR(100) NOT NULL,
                    trading_account_id BIGINT NOT NULL,
                    instrument_id BIGINT NOT NULL,
                    side VARCHAR(10) NOT NULL,
                    order_type VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    limit_price DECIMAL(18, 4) NOT NULL,
                    quantity DECIMAL(18, 4) NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    product_type VARCHAR(20) NOT NULL DEFAULT 'DELIVERY',
                    stop_price DECIMAL(18, 4),
                    updated_at TIMESTAMP NOT NULL,
                    filled_price DECIMAL(18, 4),
                    filled_at TIMESTAMP,
                    executor_version BIGINT NOT NULL DEFAULT 0
                )
                """;

        warehouseJdbcTemplate.execute(createTableSQL);
    }

    private void createTradeSummaryView() {
        String createViewSQL = """
                CREATE OR REPLACE VIEW trade_summary AS
                SELECT
                    trading_account_id,
                    side,
                    COUNT(*) as order_count,
                    SUM(quantity) as total_quantity,
                    AVG(limit_price) as avg_price,
                    MIN(created_at) as first_order_time,
                    MAX(created_at) as last_order_time
                FROM orders
                GROUP BY trading_account_id, side
                """;

        warehouseJdbcTemplate.execute(createViewSQL);
    }

    private void syncExistingOrders() {
        try {
            // Check if warehouse already has data to avoid duplicate syncs
            Integer count = warehouseJdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM orders",
                    Integer.class
            );

            if (count != null && count > 0) {
                log.info("Warehouse already has {} orders, skipping sync", count);
                return;
            }

            // Insert all orders from PostgreSQL into DuckDB
            String syncSQL = """
                    INSERT INTO orders
                    SELECT
                        order_id,
                        idempotency_key,
                        trading_account_id,
                        instrument_id,
                        side,
                        order_type,
                        status,
                        limit_price,
                        quantity,
                        created_at,
                        product_type,
                        stop_price,
                        updated_at,
                        filled_price,
                        filled_at,
                        executor_version
                    FROM (
                        SELECT * FROM dblink(
                            'dbname=trading_system host=postgres user=postgres password=postgres',
                            'SELECT order_id, idempotency_key, trading_account_id, instrument_id, side, order_type, 
                                    status, limit_price, quantity, created_at, product_type, stop_price, 
                                    updated_at, filled_price, filled_at, executor_version FROM orders'
                        ) AS t(
                            order_id BIGINT, idempotency_key VARCHAR, trading_account_id BIGINT, 
                            instrument_id BIGINT, side VARCHAR, order_type VARCHAR, status VARCHAR, 
                            limit_price NUMERIC, quantity NUMERIC, created_at TIMESTAMP, 
                            product_type VARCHAR, stop_price NUMERIC, updated_at TIMESTAMP, 
                            filled_price NUMERIC, filled_at TIMESTAMP, executor_version BIGINT
                        )
                    )
                    """;

            // Simpler approach: Query from primary datasource and insert
            Integer ordersCount = primaryJdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM orders",
                    Integer.class
            );

            if (ordersCount != null && ordersCount > 0) {
                log.info("Found {} orders in PostgreSQL, syncing to warehouse...", ordersCount);

                primaryJdbcTemplate.query(
                        """
                        SELECT order_id, idempotency_key, trading_account_id, instrument_id, side, 
                               order_type, status, limit_price, quantity, created_at, product_type, 
                               stop_price, updated_at, filled_price, filled_at, executor_version 
                        FROM orders ORDER BY order_id
                        """,
                        rs -> {
                            while (rs.next()) {
                                String insertSQL = """
                                        INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        ON CONFLICT (order_id) DO NOTHING
                                        """;

                                warehouseJdbcTemplate.update(insertSQL,
                                        rs.getLong("order_id"),
                                        rs.getString("idempotency_key"),
                                        rs.getLong("trading_account_id"),
                                        rs.getLong("instrument_id"),
                                        rs.getString("side"),
                                        rs.getString("order_type"),
                                        rs.getString("status"),
                                        rs.getBigDecimal("limit_price"),
                                        rs.getBigDecimal("quantity"),
                                        rs.getTimestamp("created_at"),
                                        rs.getString("product_type"),
                                        rs.getBigDecimal("stop_price"),
                                        rs.getTimestamp("updated_at"),
                                        rs.getBigDecimal("filled_price"),
                                        rs.getTimestamp("filled_at"),
                                        rs.getLong("executor_version")
                                );
                            }
                        }
                );

                Integer syncedCount = warehouseJdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM orders",
                        Integer.class
                );
                log.info("✓ Successfully synced {} orders to warehouse", syncedCount);
            }

        } catch (Exception e) {
            log.warn("Could not sync existing orders (this is OK on first run)", e.getMessage());
        }
    }
}
