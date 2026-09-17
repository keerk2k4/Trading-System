package com.tradingsystem.spring_boot_app.warehouse;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Service for syncing orders to the DuckDB warehouse.
 * 
 * Writes order events to DuckDB in real-time as they're processed.
 * DuckDB serves as the analytics data warehouse for reporting and querying.
 */
@Slf4j
@Service
public class WarehouseService {

    private final JdbcTemplate warehouseJdbcTemplate;

    public WarehouseService(JdbcTemplate warehouseJdbcTemplate) {
        this.warehouseJdbcTemplate = warehouseJdbcTemplate;
    }

    /**
     * Write a newly created order to the warehouse.
     * Called immediately after order is persisted to PostgreSQL.
     */
    public void writeOrderCreated(Long orderId, Long accountId, Long instrumentId, 
                                   String side, String orderType, BigDecimal price, 
                                   BigDecimal quantity, String idempotencyKey) {
        try {
            String sql = """
                    INSERT INTO orders (
                        order_id, idempotency_key, trading_account_id, instrument_id, 
                        side, order_type, status, limit_price, quantity, created_at, 
                        product_type, updated_at, executor_version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (order_id) DO NOTHING
                    """;

            warehouseJdbcTemplate.update(sql,
                    orderId,
                    idempotencyKey,
                    accountId,
                    instrumentId,
                    side,
                    orderType,
                    "NEW",
                    price,
                    quantity,
                    LocalDateTime.now(),
                    "DELIVERY",
                    LocalDateTime.now(),
                    0L
            );

            log.debug("✓ Order {} written to warehouse", orderId);
        } catch (Exception e) {
            log.error("Failed to write order {} to warehouse", orderId, e);
            // Don't throw - warehouse writes should not fail the main order flow
        }
    }

    /**
     * Update order status in warehouse when filled by trade-executor.
     * Called when order status changes (FILLED, CANCELLED, etc.)
     */
    public void updateOrderStatus(Long orderId, String newStatus, BigDecimal filledPrice, LocalDateTime filledAt) {
        try {
            String sql = """
                    UPDATE orders 
                    SET status = ?, filled_price = ?, filled_at = ?, updated_at = ?
                    WHERE order_id = ?
                    """;

            warehouseJdbcTemplate.update(sql,
                    newStatus,
                    filledPrice,
                    filledAt,
                    LocalDateTime.now(),
                    orderId
            );

            log.debug("✓ Order {} status updated to {} in warehouse", orderId, newStatus);
        } catch (Exception e) {
            log.error("Failed to update order {} status in warehouse", orderId, e);
        }
    }

    /**
     * Query warehouse for trade summary by account.
     */
    public void logTradeSummary() {
        try {
            warehouseJdbcTemplate.query(
                    "SELECT * FROM trade_summary",
                    rs -> {
                        while (rs.next()) {
                            log.info("Account {} - Side: {} - Orders: {} - Total Qty: {} - Avg Price: {}",
                                    rs.getLong("trading_account_id"),
                                    rs.getString("side"),
                                    rs.getLong("order_count"),
                                    rs.getBigDecimal("total_quantity"),
                                    rs.getBigDecimal("avg_price")
                            );
                        }
                    }
            );
        } catch (Exception e) {
            log.error("Failed to query trade summary", e);
        }
    }
}
