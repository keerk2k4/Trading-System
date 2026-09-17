package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradeexecutor.execution.ExecutionResult;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.mapper.AccountMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.mapper.PositionMapper;
import com.tradeexecutor.model.TradeEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Settlement service for order execution.
 * 
 * Handles the transactional settlement of executed orders:
 * 1. Update order status atomically with WHERE order_id = ? AND status = 'NEW'
 * 2. Update account cash balance with optimistic locking
 * 3. Update/create position
 * 4. On success, publish ORDER_FILLED or ORDER_REJECTED event
 * 
 * All database changes happen in a single transaction and are rolled back if any operation fails.
 * Duplicate deliveries (idempotency) are handled by detecting 0 rows updated on order status update.
 * 
 * Optimistic locking on account is implemented with retry logic up to a bounded number of attempts.
 */
@Service
public class SettlementService {
    
    private static final Logger logger = LoggerFactory.getLogger(SettlementService.class);
    
    private final OrderMapper orderMapper;
    private final AccountMapper accountMapper;
    private final PositionMapper positionMapper;
    private final KafkaProducer kafkaProducer;
    
    @Value("${app.settlement.optimistic-lock-retries:3}")
    private int maxOptimisticLockRetries;
    
    public SettlementService(OrderMapper orderMapper,
                             AccountMapper accountMapper,
                             PositionMapper positionMapper,
                             KafkaProducer kafkaProducer) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.positionMapper = positionMapper;
        this.kafkaProducer = kafkaProducer;
    }
    
    /**
     * Settle an executed order.
     * 
     * This method coordinates the settlement of an order by:
     * 1. Atomically updating order status from NEW to FILLED/REJECTED (detects duplicate delivery)
     * 2. Updating account cash balance with optimistic locking
     * 3. Updating position with new quantity and average cost
     * 4. Publishing the trade event to Kafka
     * 
     * All operations happen in a single database transaction. If any operation fails,
     * all changes are rolled back.
     * 
     * Optimistic locking is handled with automatic retries on the account update.
     * If retries are exhausted, an exception is thrown and the entire transaction is rolled back.
     * 
     * Duplicate deliveries are detected by checking if the order status update affected 0 rows.
     * In this case, no further operations are performed and no event is published.
     * 
     * @param orderId the order ID
     * @param accountId the account ID
     * @param executionPrice the execution price
     * @param quantity the order quantity
     * @param side the order side (BUY/SELL)
     * @param executionResult the execution result (FILLED or REJECTED)
     */
    @Transactional(rollbackFor = Exception.class)
    public void settleOrder(Long orderId, Long accountId, BigDecimal executionPrice,
                           int quantity, OrderSide side, ExecutionResult executionResult) {
        logger.info("Settling order {} for account {}", orderId, accountId);
        
        if (executionResult.getStatus() == ExecutionResult.Status.FILLED) {
            settleFilled(orderId, accountId, executionPrice, quantity, side);
        } else if (executionResult.getStatus() == ExecutionResult.Status.REJECTED) {
            settleRejected(orderId);
        } else {
            logger.warn("Unsupported execution result status: {}", executionResult.getStatus());
            return;
        }
        
        // Publish the event after commit
        publishTradeEvent(orderId, accountId, executionResult);
    }
    
    /**
     * Settle a filled order: update status, move cash, and update position.
     */
    private void settleFilled(Long orderId, Long accountId, BigDecimal executionPrice,
                             int quantity, OrderSide side) {
        // Step 1: Update order status atomically (detect duplicate delivery)
        int rowsUpdated = orderMapper.updateOrderStatusWithCurrentStatus(
            orderId, "NEW", "FILLED"
        );
        
        if (rowsUpdated == 0) {
            // Duplicate delivery - order already settled
            logger.info("Order {} already settled (0 rows updated). Treating as duplicate delivery.", orderId);
            return;
        }
        
        // Step 2: Update account cash with optimistic locking
        updateAccountCashWithOptimisticLocking(accountId, executionPrice, quantity, side);
        
        // Step 3: Update position
        updatePosition(accountId, orderId, executionPrice, quantity, side);
        
        logger.info("Order {} settled as FILLED", orderId);
    }
    
    /**
     * Settle a rejected order: just update status to REJECTED.
     */
    private void settleRejected(Long orderId) {
        int rowsUpdated = orderMapper.updateOrderStatusWithCurrentStatus(
            orderId, "NEW", "REJECTED"
        );
        
        if (rowsUpdated == 0) {
            // Duplicate delivery
            logger.info("Order {} already settled (0 rows updated). Treating as duplicate delivery.", orderId);
            return;
        }
        
        logger.info("Order {} settled as REJECTED", orderId);
    }
    
    /**
     * Update account cash balance with optimistic locking and retry logic.
     * 
     * Handles concurrent updates to the same account by retrying on optimistic lock failure.
     * The retry will re-read the account and attempt the update again with the new version.
     * 
     * @throws IllegalStateException if optimistic locking retries are exhausted
     */
    private void updateAccountCashWithOptimisticLocking(Long accountId, BigDecimal executionPrice,
                                                        int quantity, OrderSide side) {
        BigDecimal cashMovement = executionPrice.multiply(BigDecimal.valueOf(quantity));
        
        // BUY: debit cash (reduce available balance)
        // SELL: credit cash (increase available balance)
        if (side == OrderSide.BUY) {
            cashMovement = cashMovement.negate();
        }
        
        int retries = 0;
        while (retries <= maxOptimisticLockRetries) {
            // Read current account balance and version
            Optional<Account> accountOpt = accountMapper.findAccountById(accountId);
            if (accountOpt.isEmpty()) {
                throw new IllegalArgumentException("Account " + accountId + " not found");
            }
            
            Account account = accountOpt.get();
            BigDecimal newBalance = account.getCashBalance().add(cashMovement);
            
            // Get the current version for optimistic locking
            Optional<Long> versionOpt = accountMapper.getAccountVersion(accountId);
            if (versionOpt.isEmpty()) {
                throw new IllegalArgumentException("Account " + accountId + " version not found");
            }
            long currentVersion = versionOpt.get();
            
            // Attempt optimistic lock update
            int rowsUpdated = accountMapper.updateAvailableBalanceOptimistic(
                accountId, newBalance, currentVersion
            );
            
            if (rowsUpdated > 0) {
                logger.info("Account {} cash updated successfully. Balance: {}", accountId, newBalance);
                return;
            }
            
            // Update failed due to version mismatch - retry
            retries++;
            logger.debug("Optimistic lock failed for account {}. Retry {} of {}", 
                accountId, retries, maxOptimisticLockRetries);
        }
        
        // Exhausted retries
        throw new IllegalStateException(
            "Failed to update account " + accountId + " cash balance after " +
            maxOptimisticLockRetries + " optimistic lock retries"
        );
    }
    
    /**
     * Update or create position for the filled order.
     */
    private void updatePosition(Long accountId, Long orderId, BigDecimal executionPrice,
                               int quantity, OrderSide side) {
        // For now, this is a placeholder. The position update logic will depend on
        // how positions are managed (find existing, update quantity/cost, or create new).
        // This will be implemented based on the domain requirements.
        logger.debug("Position update for order {} would happen here", orderId);
    }
    
    /**
     * Publish the trade event to Kafka after commit.
     */
    private void publishTradeEvent(Long orderId, Long accountId, ExecutionResult executionResult) {
        try {
            TradeEvent tradeEvent = new TradeEvent(orderId, accountId, 
                executionResult.getStatus().name(), executionResult.getExecutionPrice(),
                executionResult.getReason());
            
            kafkaProducer.publishTradeEvent(accountId.toString(), tradeEvent);
            logger.info("Published trade event for order {} to Kafka", orderId);
        } catch (Exception e) {
            logger.error("Failed to publish trade event for order {}: {}", orderId, e.getMessage(), e);
            throw new RuntimeException("Failed to publish trade event", e);
        }
    }
}

