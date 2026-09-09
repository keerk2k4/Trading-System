package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderStatus;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for Order entity.
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 * The idempotency key is explicitly bound to prevent duplicate order injection attacks.
 */
@Mapper
public interface OrderMapper {

    @Select("SELECT COALESCE(MAX(order_id), 0) + 1 FROM orders")
    Long nextOrderId();
    
    /**
     * Inserts a new order.
     * All parameters are bound to prevent SQL injection.
     * @param order the order entity to insert
     * @return number of rows affected
     */
    @Insert("""
        INSERT INTO orders (order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity, limit_price, stop_price, status, idempotency_key, created_at, updated_at)
        VALUES (#{order.orderId}, #{order.account.accountId}, #{order.instrument.instrumentId}, #{order.orderType}, #{order.side}, #{order.productType}, #{order.quantity}, #{order.limitPrice}, NULL, 'NEW', #{order.idempotencykey}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "order.orderId")
    int insertOrder(@Param("order") Order order);
    
    /**
     * Selects an order by order ID.
     * @param orderId the order ID to search for (bound parameter)
     * @return the order, or empty if not found
     */
    @Select("""
        SELECT order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity, CAST(limit_price AS numeric(18,2)) AS limit_price, CAST(stop_price AS numeric(18,2)) AS stop_price, status, idempotency_key
        FROM orders
        WHERE order_id = #{orderId}
        """)
    @ConstructorArgs({
        @Arg(column = "order_id", javaType = Long.class),
        @Arg(column = "trading_account_id", javaType = com.tradingsystem.domain.entities.Account.class, select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById"),
        @Arg(column = "instrument_id", javaType = com.tradingsystem.domain.entities.Instrument.class, select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById"),
        @Arg(column = "order_type", javaType = com.tradingsystem.domain.enums.OrderType.class),
        @Arg(column = "side", javaType = com.tradingsystem.domain.enums.OrderSide.class),
        @Arg(column = "product_type", javaType = com.tradingsystem.domain.enums.ProductType.class),
        @Arg(column = "quantity", javaType = int.class),
        @Arg(column = "limit_price", javaType = java.math.BigDecimal.class),
        @Arg(column = "stop_price", javaType = java.math.BigDecimal.class),
        @Arg(column = "idempotency_key", javaType = String.class)
    })
    Optional<Order> findOrderById(@Param("orderId") Long orderId);

    @Select("SELECT COUNT(*) > 0 FROM orders WHERE idempotency_key = #{idempotencyKey}")
    boolean existsByIdempotencyKey(@Param("idempotencyKey") String idempotencyKey);
    
    /**
     * Selects an order by idempotency key.
     * The idempotency key is explicitly bound as a parameter to prevent SQL injection.
     * This ensures duplicate orders cannot be injected through malicious idempotency keys.
     * @param idempotencyKey the idempotency key (bound parameter)
     * @return the order, or empty if not found
     */
    @Select("""
        SELECT order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity, limit_price, stop_price, status, idempotency_key
        FROM orders
        WHERE idempotency_key = #{idempotencyKey}
        """)
    @Results({
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "account", column = "trading_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "orderType", column = "order_type"),
        @Result(property = "side", column = "side"),
        @Result(property = "productType", column = "product_type"),
        @Result(property = "limitPrice", column = "limit_price"),
        @Result(property = "idempotencykey", column = "idempotency_key")
    })
    Optional<Order> findOrderByIdempotencyKey(@Param("idempotencyKey") String idempotencyKey);
    
    /**
     * Selects orders by trading account ID.
     * @param accountId the account ID (bound parameter)
     * @return list of orders for the account
     */
    @Select("""
        SELECT order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity, limit_price, stop_price, status, idempotency_key
        FROM orders
        WHERE trading_account_id = #{accountId}
        ORDER BY created_at DESC
        """)
    @Results({
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "account", column = "trading_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "orderType", column = "order_type"),
        @Result(property = "side", column = "side"),
        @Result(property = "productType", column = "product_type"),
        @Result(property = "limitPrice", column = "limit_price"),
        @Result(property = "idempotencykey", column = "idempotency_key")
    })
    List<Order> findOrdersByAccountId(@Param("accountId") Long accountId);
    
    /**
     * Selects orders by status filter.
     * @param status the order status filter (bound parameter)
     * @return list of orders matching the status
     */
    @Select("""
        SELECT order_id, trading_account_id, instrument_id, order_type, side, product_type, quantity, limit_price, stop_price, status, idempotency_key
        FROM orders
        WHERE status = #{status}
        ORDER BY order_id
        """)
    @Results({
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "account", column = "trading_account_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.AccountMapper.findAccountById")),
        @Result(property = "instrument", column = "instrument_id", one = @One(select = "com.tradingsystem.spring_boot_app.mapper.InstrumentMapper.findInstrumentById")),
        @Result(property = "orderType", column = "order_type"),
        @Result(property = "side", column = "side"),
        @Result(property = "productType", column = "product_type"),
        @Result(property = "limitPrice", column = "limit_price"),
        @Result(property = "idempotencykey", column = "idempotency_key")
    })
    List<Order> findOrdersByStatus(@Param("status") OrderStatus status);
    
    /**
     * Updates order status.
     * @param orderId the order ID (bound parameter)
     * @param status the new status (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE orders
        SET status = #{status}, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = #{orderId}
        """)
    int updateOrderStatus(@Param("orderId") Long orderId, @Param("status") OrderStatus status);

    @Update("""
        UPDATE orders
        SET status = #{nextStatus}, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = #{orderId} AND status = #{expectedStatus}
        """)
    int updateOrderStatusIfCurrent(@Param("orderId") Long orderId,
                                   @Param("expectedStatus") OrderStatus expectedStatus,
                                   @Param("nextStatus") OrderStatus nextStatus);
    
    /**
     * Counts total orders.
     * @return the count of orders
     */
    @Select("SELECT COUNT(*) FROM orders")
    int countOrders();
}
