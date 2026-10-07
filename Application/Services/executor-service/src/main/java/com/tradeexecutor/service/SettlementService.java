package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.ProductType;
import com.tradeexecutor.execution.ExecutionResult;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.mapper.AccountMapper;
import com.tradeexecutor.mapper.HoldingMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.mapper.PositionMapper;
import com.tradeexecutor.mapper.SettlementJobMapper;
import com.tradeexecutor.model.TradeEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
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
 * 3. Update/create position; a SELL also records its realised P&L against the
 *    position's weighted average cost
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
    private final HoldingMapper holdingMapper;
    private final SettlementJobMapper settlementJobs;
    private final KafkaProducer kafkaProducer;
    private final java.util.concurrent.ScheduledExecutorService holdingsScheduler =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "holdings-settlement");
                t.setDaemon(true);
                return t;
            });
    
    @Value("${app.settlement.optimistic-lock-retries:3}")
    private int maxOptimisticLockRetries;

    @Value("${app.settlement.holdings-delay-ms:15000}")
    private long holdingsDelayMs;
    
    public SettlementService(OrderMapper orderMapper,
                             AccountMapper accountMapper,
                             PositionMapper positionMapper,
                             HoldingMapper holdingMapper,
                             KafkaProducer kafkaProducer) {
        this(orderMapper, accountMapper, positionMapper, holdingMapper, null, kafkaProducer);
    }

    @Autowired
    public SettlementService(OrderMapper orderMapper,
                             AccountMapper accountMapper,
                             PositionMapper positionMapper,
                             HoldingMapper holdingMapper,
                             SettlementJobMapper settlementJobs,
                             KafkaProducer kafkaProducer) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.positionMapper = positionMapper;
        this.holdingMapper = holdingMapper;
        this.settlementJobs = settlementJobs;
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
     * Settle a filled order: update status, move cash, and record positions now.
     *
     * <p>Move semantics (positions -&gt; holdings after the settlement window):
     * <ul>
     *   <li>BUY DELIVERY: the bought quantity is added to positions now and
     *   <em>moved</em> to holdings after {@code app.settlement.holdings-delay-ms}
     *   (15s): the deferred leg credits holdings, subtracts the same quantity
     *   from positions, and deletes the position row when it reaches zero.</li>
     *   <li>SELL DELIVERY: settled shares leave custody at fill time, so
     *   holdings are debited immediately in this transaction and no position
     *   row is created -- there is nothing to move later.</li>
     *   <li>INTRADAY: positions only, never holdings.</li>
     * </ul>
     */
    private void settleFilled(Long orderId, Long accountId, BigDecimal executionPrice,
                              int quantity, OrderSide side) {
        logger.info("  Updating order status to FILLED in database...");
        // Step 1: Update order status atomically (detect duplicate delivery)
        int rowsUpdated = orderMapper.markOrderFilled(orderId, executionPrice);
        
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
        
        // Step 3: Update position now; holdings follow after the settlement delay.
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order " + orderId + " not found for settlement"));
        
        if (order.getProductType() == ProductType.DELIVERY) {
            if (side == OrderSide.BUY) {
                logger.info("  Updating position for account {} (DELIVERY BUY)...", accountId);
                updatePosition(accountId, orderId, executionPrice, quantity, side);
                if (holdingsDelayMs <= 0) {
                    // Unit-test path (no Spring @Value injection): keep the legacy
                    // synchronous holdings write so existing settlement tests hold.
                    logger.info("  Updating holding synchronously (holdings-delay-ms <= 0, test path)...");
                    updateHolding(accountId, orderId, executionPrice, quantity, side);
                    logger.info("  ✓ Position and holding updated");
                } else {
                    logger.info("  ✓ Position updated (holdings settle in {}ms)", holdingsDelayMs);
                    enqueueDeferredHoldings(orderId, accountId, order.getInstrument().getInstrumentId(),
                            quantity, side.name());
                }
            } else {
                // DELIVERY SELL: settled shares leave custody at fill time, so
                // holdings are debited immediately in this transaction and no
                // position row is created -- there is nothing to move later.
                // Realised P&L is still recorded against the holdings' weighted
                // average cost, the same method as before.
                logger.info("  Debiting holding for account {} (DELIVERY SELL)...", accountId);
                Optional<Holding> holdingBefore = holdingMapper.findHoldingByAccountAndInstrument(
                        accountId, order.getInstrument().getInstrumentId());
                BigDecimal costBasis = holdingBefore.map(Holding::getAveragePrice).orElse(null);
                updateHolding(accountId, orderId, executionPrice, quantity, side);
                if (costBasis != null) {
                    recordRealizedPnl(orderId, costBasis.setScale(2, RoundingMode.HALF_UP),
                            executionPrice, quantity);
                }
                logger.info("  ✓ Holding debited (no position leg for sells)");
            }
        } else {
            logger.info("  Updating position for account {} (INTRADAY product)...", accountId);
            updatePosition(accountId, orderId, executionPrice, quantity, side);
            logger.info("  ✓ Position updated");
        }
    }

    /**
     * Enqueue the delayed holdings leg and schedule it. The sweeper below
     * re-applies any job left PENDING (e.g. after a restart), so at-least-once
     * holds for the holdings write too.
     */
    private void enqueueDeferredHoldings(Long orderId, Long accountId, Long instrumentId,
                                         int quantity, String side) {
        if (settlementJobs != null) {
            try {
                settlementJobs.enqueue(orderId, accountId, instrumentId, quantity, side, holdingsDelayMs);
            } catch (Exception e) {
                logger.warn("  Could not enqueue settlement job for order {} ({}); holdings still scheduled in-memory",
                        orderId, e.getMessage());
            }
        }
        long delay = Math.max(0, holdingsDelayMs);
        holdingsScheduler.schedule(() -> {
            try {
                applyDeferredHoldings(orderId);
            } catch (Exception e) {
                logger.error("  Deferred holdings settlement failed for order {}", orderId, e);
            }
        }, delay, java.util.concurrent.TimeUnit.MILLISECONDS);
        logger.info("  Holdings settlement for order {} scheduled in {}ms", orderId, delay);
    }

    /**
     * Apply the delayed holdings (demat) leg for a FILLED DELIVERY BUY order:
     * credit holdings at the execution price, then MOVE the same quantity out
     * of positions, deleting the position row when it reaches zero.
     *
     * <p>Idempotent: skipped when the settlement job is already COMPLETE.
     */
    @Transactional(rollbackFor = Exception.class)
    public void applyDeferredHoldings(Long orderId) {
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order " + orderId + " not found for holdings settlement"));
        if (!"FILLED".equalsIgnoreCase(String.valueOf(order.getStatus()))) {
            logger.info("  Skipping holdings settlement for order {} (status={})", orderId, order.getStatus());
            return;
        }
        if (order.getProductType() != ProductType.DELIVERY || order.getSide() != OrderSide.BUY) {
            if (settlementJobs != null) {
                settlementJobs.markComplete(orderId);
            }
            return;
        }
        if (settlementJobs != null && "COMPLETE".equalsIgnoreCase(settlementJobs.findStatus(orderId))) {
            return;
        }
        updateHoldingFromFilledOrder(orderId);
        moveSettledQuantityOutOfPositions(order);
        if (settlementJobs != null) {
            settlementJobs.markComplete(orderId);
        }
        logger.info("  ✓ Deferred holdings settled and positions moved for order {}", orderId);
    }

    /**
     * The second half of the move: subtract the settled quantity from the
     * position row and delete the row when nothing unsettled remains.
     */
    private void moveSettledQuantityOutOfPositions(Order order) {
        Long accountId = order.getAccount().getAccountId();
        Long instrumentId = order.getInstrument().getInstrumentId();
        Position current = positionMapper.findPositionByAccountAndInstrument(accountId, instrumentId)
            .orElseThrow(() -> new IllegalStateException(
                "No position to move for settled order " + order.getOrderId()));
        int remaining = current.getQuantity() - order.getQuantity();
        if (remaining < 0) {
            throw new IllegalStateException(
                "Position quantity " + current.getQuantity() + " below settled quantity "
                + order.getQuantity() + " for order " + order.getOrderId());
        }
        if (remaining == 0) {
            if (positionMapper.deletePosition(current.getPositionId()) == 0) {
                throw new IllegalStateException(
                    "Failed to remove moved position for order " + order.getOrderId());
            }
            logger.info("    ✓ Position fully moved and removed (positionId={})", current.getPositionId());
            return;
        }
        // Average cost is unchanged by removing shares; only quantity moves.
        if (positionMapper.updatePosition(current.getPositionId(), remaining,
                current.getAveragePrice()) == 0) {
            throw new IllegalStateException(
                "Failed to move settled quantity out of position for order " + order.getOrderId());
        }
        logger.info("    ✓ Position moved (positionId={}, remaining={})",
                current.getPositionId(), remaining);
    }

    private void updateHoldingFromFilledOrder(Long orderId) {
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order " + orderId + " not found for holding update"));
        BigDecimal filledPrice = readFilledPrice(orderId);
        if (filledPrice == null) {
            throw new IllegalStateException("No execution price recorded for order " + orderId);
        }
        updateHolding(order.getAccount().getAccountId(), orderId, filledPrice,
                order.getQuantity(), order.getSide());
    }

    private BigDecimal readFilledPrice(Long orderId) {
        try {
            return orderMapper.findFilledPrice(orderId).orElse(null);
        } catch (Exception e) {
            logger.warn("Could not read filled_price for order {}, falling back to position average", orderId);
            Order order = orderMapper.findOrderById(orderId).orElse(null);
            if (order == null) {
                return null;
            }
            return positionMapper.findPositionByAccountAndInstrument(
                    order.getAccount().getAccountId(), order.getInstrument().getInstrumentId())
                    .map(Position::getAveragePrice).orElse(order.getLimitPrice());
        }
    }

    /**
     * Crash-recovery sweeper: applies any PENDING settlement job past its due time.
     */
    @Scheduled(fixedDelayString = "${app.settlement.sweep-interval-ms:10000}")
    public void sweepDueSettlements() {
        if (settlementJobs == null) {
            return;
        }
        try {
            for (Long orderId : settlementJobs.findDue(50)) {
                try {
                    applyDeferredHoldings(orderId);
                } catch (Exception e) {
                    logger.warn("Sweep failed for holdings settlement of order {}", orderId, e);
                    try {
                        settlementJobs.markFailed(orderId);
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("Holdings settlement sweep failed", e);
        }
    }
    
    /**
     * Settle a rejected order: just update status to REJECTED.
     */
    private void settleRejected(Long orderId) {
        logger.info("  Updating order status to REJECTED in database...");
        int rowsUpdated = orderMapper.markOrderRejected(orderId);
        
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
                recordRealizedPnl(orderId, updatedAveragePrice, executionPrice, quantity);
            }

            if (updatedQuantity == 0) {
                // Fully sold: remove the active position row. The SELL order
                // itself remains in orders/order_history as the audit trail.
                int deleted = positionMapper.deletePosition(current.getPositionId());
                if (deleted == 0) {
                    throw new IllegalStateException("Failed to remove sold-out position for account " + accountId + " and instrument " + instrumentId);
                }
                logger.info("    ✓ Position fully sold and removed (positionId={})",
                    current.getPositionId());
                return;
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
     * Realised P&L of a SELL against the weighted average cost of the shares
     * held: (executionPrice - averageCost) x quantity. Recorded on the order
     * in the same transaction as the fill.
     */
    private void recordRealizedPnl(Long orderId, BigDecimal averageCost,
                                   BigDecimal executionPrice, int quantity) {
        BigDecimal realizedPnl = executionPrice.subtract(averageCost)
            .multiply(BigDecimal.valueOf(quantity))
            .setScale(4, RoundingMode.HALF_UP);
        if (orderMapper.recordRealizedPnl(orderId, averageCost, realizedPnl) == 0) {
            throw new IllegalStateException("Failed to record realised P&L for SELL order " + orderId);
        }
        logger.info("    ✓ Realised P&L recorded (avgCost={}, sellPrice={}, quantity={}, pnl={})",
            averageCost, executionPrice, quantity, realizedPnl);
    }

    /**
     * Update or create a holding for DELIVERY product type (equity holdings in demat account).
     * 
     * BUY: Add quantity to existing holding or create new holding
     * SELL: Reduce quantity from existing holding (validates sufficient quantity)
     */
    private void updateHolding(Long accountId, Long orderId, BigDecimal executionPrice,
                              int quantity, OrderSide side) {
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order " + orderId + " not found for holding update"));

        Long instrumentId = order.getInstrument().getInstrumentId();
        Optional<Holding> existingHolding = holdingMapper.findHoldingByAccountAndInstrument(accountId, instrumentId);

        if (existingHolding.isPresent()) {
            Holding current = existingHolding.get();
            int updatedQuantity;
            BigDecimal updatedAveragePrice;

            if (side == OrderSide.BUY) {
                updatedQuantity = current.getQuantity() + quantity;
                if (updatedQuantity <= 0) {
                    throw new IllegalStateException("Invalid holding quantity after BUY for order " + orderId);
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
                    throw new IllegalStateException("Insufficient holding quantity for SELL on order " + orderId);
                }
                // SELL preserves weighted average cost basis; only quantity changes.
                updatedAveragePrice = current.getAveragePrice().setScale(2, RoundingMode.HALF_UP);
            }

            if (updatedQuantity == 0) {
                int deleted = holdingMapper.deleteHolding(current.getHoldingId());
                if (deleted == 0) {
                    throw new IllegalStateException("Failed to remove sold-out holding for account " + accountId + " and instrument " + instrumentId);
                }
                logger.info("    ✓ Holding fully sold and removed (holdingId={})",
                    current.getHoldingId());
                return;
            }

            int updated = holdingMapper.updateHolding(current.getHoldingId(), updatedQuantity, updatedAveragePrice);
            if (updated == 0) {
                throw new IllegalStateException("Failed to update holding for account " + accountId + " and instrument " + instrumentId);
            }

            logger.info("    ✓ Existing holding updated (holdingId={}, quantity={}, avgPrice={})",
                current.getHoldingId(), updatedQuantity, updatedAveragePrice);
            return;
        }

        if (side == OrderSide.SELL) {
            throw new IllegalStateException("No existing holding to SELL for account " + accountId + " and instrument " + instrumentId);
        }

        Account account = accountMapper.findAccountById(accountId)
            .orElseThrow(() -> new IllegalArgumentException("Account " + accountId + " not found for holding insert"));

        Holding newHolding = new Holding(
            System.nanoTime(),  // Generate holding ID
            account,
            order.getInstrument(),
            quantity,
            executionPrice.setScale(2, RoundingMode.HALF_UP)
        );

        int inserted = holdingMapper.insertHolding(newHolding);
        if (inserted == 0) {
            throw new IllegalStateException("Failed to create holding for account " + accountId + " and instrument " + instrumentId);
        }

        logger.info("    ✓ New holding created (holdingId={}, quantity={}, avgPrice={})",
            newHolding.getHoldingId(), quantity, newHolding.getAveragePrice());
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

