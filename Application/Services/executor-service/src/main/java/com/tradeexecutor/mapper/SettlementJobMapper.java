package com.tradeexecutor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Insert;

import java.util.List;

/**
 * Tracks the delayed holdings (demat) leg of settlement in
 * {@code trading.settlement_jobs} (migration 021). The fill transaction
 * enqueues one PENDING row per FILLED DELIVERY order with
 * {@code due_at = now + holdings-delay}; the settlement applier flips it to
 * COMPLETE after applying the holdings write, so a restart can resume.
 */
@Mapper
public interface SettlementJobMapper {

    @Insert("""
        INSERT INTO trading.settlement_jobs
            (order_id, trading_account_id, instrument_id, quantity, side, status, due_at)
        VALUES (#{orderId}, #{accountId}, #{instrumentId}, #{quantity}, #{side}, 'PENDING',
                CURRENT_TIMESTAMP + (#{delayMs} || ' milliseconds')::interval)
        ON CONFLICT (order_id) DO NOTHING
        """)
    int enqueue(@Param("orderId") Long orderId,
                @Param("accountId") Long accountId,
                @Param("instrumentId") Long instrumentId,
                @Param("quantity") int quantity,
                @Param("side") String side,
                @Param("delayMs") long delayMs);

    @Select("""
        SELECT order_id FROM trading.settlement_jobs
        WHERE status = 'PENDING' AND due_at <= CURRENT_TIMESTAMP
        ORDER BY due_at LIMIT #{limit}
        """)
    List<Long> findDue(@Param("limit") int limit);

    @Select("""
        SELECT status FROM trading.settlement_jobs WHERE order_id = #{orderId}
        """)
    String findStatus(@Param("orderId") Long orderId);

    @Update("""
        UPDATE trading.settlement_jobs
        SET status = 'COMPLETE', completed_at = CURRENT_TIMESTAMP
        WHERE order_id = #{orderId} AND status = 'PENDING'
        """)
    int markComplete(@Param("orderId") Long orderId);

    @Update("""
        UPDATE trading.settlement_jobs
        SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP
        WHERE order_id = #{orderId} AND status = 'PENDING'
        """)
    int markFailed(@Param("orderId") Long orderId);
}
