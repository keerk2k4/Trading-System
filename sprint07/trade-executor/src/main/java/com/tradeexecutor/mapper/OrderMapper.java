package com.tradeexecutor.mapper;

import com.tradingsystem.domain.entities.Order;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Order entity.
 * Provides database access for orders in the Trade Executor.
 * All parameters are bound to prevent SQL injection.
 */
@Mapper
public interface OrderMapper {
    
    /**
     * Find an order by order ID.
     * @param orderId the order ID (bound parameter)
     * @return the order, or empty if not found
     */
    @Select("""
        SELECT order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity,
               CAST(limit_price AS numeric(18,2)) AS limit_price,
               CAST(stop_price AS numeric(18,2)) AS stop_price,
               status, idempotency_key
        FROM orders
        WHERE order_id = #{orderId}
        """)
    @ConstructorArgs({
        @Arg(column = "order_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradeexecutor.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradeexecutor.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "order_type", javaType = com.tradingsystem.domain.enums.OrderType.class),
        @Arg(column = "side", javaType = com.tradingsystem.domain.enums.OrderSide.class),
        @Arg(column = "product_type", javaType = com.tradingsystem.domain.enums.ProductType.class),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "limit_price", javaType = java.math.BigDecimal.class),
        @Arg(column = "stop_price", javaType = java.math.BigDecimal.class),
        @Arg(column = "idempotency_key", javaType = String.class)
    })
    @Result(property = "status", column = "status")
    Optional<Order> findOrderById(@Param("orderId") Long orderId);
    
    /**
     * Find orders by status.
     * @param status the order status filter (bound parameter)
     * @return list of orders matching the status
     */
    @Select("""
        SELECT order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity,
               CAST(limit_price AS numeric(18,2)) AS limit_price,
               CAST(stop_price AS numeric(18,2)) AS stop_price,
               status, idempotency_key
        FROM orders
        WHERE status = #{status}
        ORDER BY order_id
        """)
    @ConstructorArgs({
        @Arg(column = "order_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradeexecutor.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradeexecutor.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "order_type", javaType = com.tradingsystem.domain.enums.OrderType.class),
        @Arg(column = "side", javaType = com.tradingsystem.domain.enums.OrderSide.class),
        @Arg(column = "product_type", javaType = com.tradingsystem.domain.enums.ProductType.class),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "limit_price", javaType = java.math.BigDecimal.class),
        @Arg(column = "stop_price", javaType = java.math.BigDecimal.class),
        @Arg(column = "idempotency_key", javaType = String.class)
    })
    @Result(property = "status", column = "status")
    List<Order> findOrdersByStatus(@Param("status") String status);
    
    /**
     * Update order status.
     * @param orderId the order ID (bound parameter)
     * @param status the new status (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE orders
        SET status = #{status}, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = #{orderId}
        """)
    int updateOrderStatus(@Param("orderId") Long orderId, @Param("status") String status);
    
    /**
     * Atomically update order status with a condition on the current status.
     * This is used for settlement to detect duplicate deliveries.
     * 
     * @param orderId the order ID (bound parameter)
     * @param currentStatus the expected current status (bound parameter)
     * @param newStatus the new status (bound parameter)
     * @return number of rows affected (0 if status didn't match, 1 if successful)
     */
    @Update("""
        UPDATE orders
        SET status = #{newStatus}, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = #{orderId} AND status = #{currentStatus}
        """)
    int updateOrderStatusWithCurrentStatus(@Param("orderId") Long orderId,
                                          @Param("currentStatus") String currentStatus,
                                          @Param("newStatus") String newStatus);
}

