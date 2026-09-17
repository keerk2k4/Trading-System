package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Order;
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
import java.math.RoundingMode;
import java.time.LocalDateTime;
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
        logger.info("=== SETTLEMENT SERVICE STARTED ===");
        logger.info("Settling order {} for account {}", orderId, accountId);
        logger.info("  Execution Result Status: {}", executionResult.getStatus());
        
        if (executionResult.getStatus() == ExecutionResult.Status.FILLED) {
            logger.info("Settling FILLED order...");
            settleFilled(orderId, accountId, executionPrice, quantity, side);
            logger.info("✓ Order settled as FILLED");
        } else if (executionResult.getStatus() == ExecutionResult.Status.REJECTED) {
            logger.info("Settling REJECTED order...");
            settleRejected(orderId);
            logger.info("✓ Order settled as REJECTED");
        } else {
            logger.warn("Unsupported execution result status: {}", executionResult.getStatus());
            return;
        }
        
        // Publish the event after commit
        logger.info("Publishing trade event to Kafka topic 'trade-events'...");
        publishTradeEvent(orderId, accountId, executionResult);
        logger.info("=== SETTLEMENT SERVICE COMPLETED ===");
    }
    
    /**
     * Settle a filled order: update status, move cash, and update position.
     */
    private void settleFilled(Long orderId, Long accountId, BigDecimal executionPrice,
                             int quantity, OrderSide side) {
        logger.info("  Updating order status to FILLED in database...");
        // Step 1: Update order status atomically (detect duplicate delivery)
        int rowsUpdated = orderMapper.updateOrderStatusWithCurrentStatus(
            orderId, "NEW", "FILLED"
        );
        
        if (rowsUpdated == 0) {
            // Duplicate delivery - order already settled
            logger.warn("  Duplicate delivery detected: Order {} already settled (0 rows updated)", orderId);
            return;
        }
        logger.info("  ✓ Order status updated to FILLED in database");
        
        // Step 2: Update account cash with optimistic locking
        logger.info("  Updating account {} cash balance...", accountId);
        BigDecimal totalCost = executionPrice.multiply(BigDecimal.valueOf(quantity));
        logger.info("    - Execution Price: {}", executionPrice);
        logger.info("    - Quantity: {}", quantity);
        logger.info("    - Total Cost/Proceeds: {}", totalCost);
        logger.info("    - Order Side: {}", side);
        updateAccountCashWithOptimisticLocking(accountId, executionPrice, quantity, side);
        logger.info("  ✓ Account cash balance updated");
        
        // Step 3: Update position
        logger.info("  Updating position for account {}...", accountId);
        updatePosition(accountId, orderId, executionPrice, quantity, side);
        logger.info("  ✓ Position updated");
    }
    
    /**
     * Settle a rejected order: just update status to REJECTED.
     */
    private void settleRejected(Long orderId) {
        logger.info("  Updating order status to REJECTED in database...");
        int rowsUpdated = orderMapper.updateOrderStatusWithCurrentStatus(
            orderId, "NEW", "REJECTED"
        );
        
        if (rowsUpdated == 0) {
            // Duplicate delivery
            logger.warn("  Duplicate delivery detected: Order {} already settled (0 rows updated)", orderId);
            return;
        }
        
        logger.info("  ✓ Order status updated to REJECTED in database");
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
            logger.debug("    Order is BUY - debiting cash by {}", cashMovement);
        } else {
            logger.debug("    Order is SELL - crediting cash by {}", cashMovement);
        }
        
        int retries = 0;
        while (retries <= maxOptimisticLockRetries) {
            logger.debug("    Attempt {} to update account cash (max {} retries)", retries, maxOptimisticLockRetries);
            
            // Read current account balance and version
            Optional<Account> accountOpt = accountMapper.findAccountById(accountId);
            if (accountOpt.isEmpty()) {
                logger.error("    Account {} not found", accountId);
                throw new IllegalArgumentException("Account " + accountId + " not found");
            }
            
            Account account = accountOpt.get();
            BigDecimal newBalance = account.getCashBalance().add(cashMovement);
            logger.debug("    Current balance: {}, New balance: {}", account.getCashBalance(), newBalance);
            
            // Get the current version for optimistic locking
            Optional<Long> versionOpt = accountMapper.getAccountVersion(accountId);
            if (versionOpt.isEmpty()) {
                logger.error("    Account {} version not found", accountId);
                throw new IllegalArgumentException("Account " + accountId + " version not found");
            }
            long currentVersion = versionOpt.get();
            logger.debug("    Current version: {}", currentVersion);
            
            // Attempt optimistic lock update
            int rowsUpdated = accountMapper.updateAvailableBalanceOptimistic(
                accountId, newBalance, currentVersion
            );
            
            if (rowsUpdated > 0) {
                logger.info("    ✓ Account {} cash updated successfully. New balance: {}", accountId, newBalance);
                return;
            }
            
            // Update failed due to version mismatch - retry
            retries++;
            logger.warn("    Optimistic lock failed for account {} (version mismatch). Retry {}/{}", 
                accountId, retries, maxOptimisticLockRetries);
        }
        
        // Exhausted retries
        logger.error("    Failed to update account {} after {} retries", accountId, maxOptimisticLockRetries);
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
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order " + orderId + " not found for position update"));

        Long instrumentId = order.getInstrument().getInstrumentId();
        Optional<Position> existingPosition = positionMapper.findPositionByAccountAndInstrument(accountId, instrumentId);

        if (existingPosition.isPresent()) {
            Position current = existingPosition.get();
            int updatedQuantity;
            BigDecimal updatedAveragePrice;

            if (side == OrderSide.BUY) {
                updatedQuantity = current.getQuantity() + quantity;
                if (updatedQuantity <= 0) {
                    throw new IllegalStateException("Invalid position quantity after BUY for order " + orderId);
                }

                BigDecimal existingNotional = current.getAveragePrice()
                    .multiply(BigDecimal.valueOf(current.getQuantity()));
                BigDecimal incomingNotional = executionPrice
                    .multiply(BigDecimal.valueOf(quantity));

                updatedAveragePrice = existingNotional.add(incomingNotional)
                    .divide(BigDecimal.valueOf(updatedQuantity), 2, RoundingMode.HALF_UP);
            } else {
                updatedQuantity = current.getQuantity() - quantity;
                if (updatedQuantity < 0) {
                    throw new IllegalStateException("Insufficient position quantity for SELL on order " + orderId);
                }
                // SELL preserves weighted average cost basis; only quantity changes.
                updatedAveragePrice = current.getAveragePrice().setScale(2, RoundingMode.HALF_UP);
            }

            int updated = positionMapper.updatePosition(current.getPositionId(), updatedQuantity, updatedAveragePrice);
            if (updated == 0) {
                throw new IllegalStateException("Failed to update position for account " + accountId + " and instrument " + instrumentId);
            }

            logger.info("    ✓ Existing position updated (positionId={}, quantity={}, avgPrice={})",
                current.getPositionId(), updatedQuantity, updatedAveragePrice);
            return;
        }

        if (side == OrderSide.SELL) {
            throw new IllegalStateException("No existing position to SELL for account " + accountId + " and instrument " + instrumentId);
        }

        Account account = accountMapper.findAccountById(accountId)
            .orElseThrow(() -> new IllegalArgumentException("Account " + accountId + " not found for position insert"));

        Position newPosition = new Position(
            positionMapper.nextPositionId(),
            account,
            order.getInstrument(),
            order.getProductType(),
            quantity,
            executionPrice.setScale(2, RoundingMode.HALF_UP),
            BigDecimal.ZERO,
            "OPEN",
            LocalDateTime.now(),
            null,
            LocalDateTime.now()
        );

        int inserted = positionMapper.insertPosition(newPosition);
        if (inserted == 0) {
            throw new IllegalStateException("Failed to create position for account " + accountId + " and instrument " + instrumentId);
        }

        logger.info("    ✓ New position created (positionId={}, quantity={}, avgPrice={})",
            newPosition.getPositionId(), quantity, newPosition.getAveragePrice());
    }
    
    /**
     * Publish the trade event to Kafka after commit.
     */
    private void publishTradeEvent(Long orderId, Long accountId, ExecutionResult executionResult) {
        try {
            logger.info("  Preparing trade event for publication...");
            TradeEvent tradeEvent = new TradeEvent(orderId, accountId, 
                executionResult.getStatus().name(), executionResult.getExecutionPrice(),
                executionResult.getReason());
            
            logger.info("  Trade Event Details:");
            logger.info("    - Order ID: {}", tradeEvent.getOrderId());
            logger.info("    - Account ID: {}", tradeEvent.getAccountId());
            logger.info("    - Status: {}", tradeEvent.getStatus());
            logger.info("    - Execution Price: {}", tradeEvent.getExecutionPrice());
            logger.info("    - Reason: {}", tradeEvent.getReason());
            
            kafkaProducer.publishTradeEvent(accountId.toString(), tradeEvent);
            logger.info("  ✓ Trade event published to 'trade-events' topic");
            logger.info("    Message Key (Account ID): {}", accountId);
        } catch (Exception e) {
            logger.error("  ✗ Failed to publish trade event for order {}: {}", orderId, e.getMessage());
            logger.error("    Stack trace: ", e);
            throw new RuntimeException("Failed to publish trade event", e);
        }
    }
}

