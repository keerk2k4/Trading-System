package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.execution.ExecutionDecision;
import com.tradeexecutor.execution.OrderExecutor;
import com.tradeexecutor.mapper.InstrumentMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Execution service for order processing.
 * 
 * High-level orchestration of the order execution workflow:
 * 1. Receive ORDER_PLACED event from Kafka
 * 2. Load order and instrument from database
 * 3. Execute order via OrderExecutor
 * 4. Settle the order (persist state and publish events)
 * 
 * The actual database updates and event publishing are delegated to SettlementService.
 * This service focuses on the execution logic: getting the execution decision.
 */
@Service
public class ExecutionService {
    
    private static final Logger logger = LoggerFactory.getLogger(ExecutionService.class);
    
    private final OrderExecutor orderExecutor;
    private final OrderMapper orderMapper;
    private final InstrumentMapper instrumentMapper;
    private final SettlementService settlementService;
    
    public ExecutionService(OrderExecutor orderExecutor,
                           OrderMapper orderMapper,
                           InstrumentMapper instrumentMapper,
                           SettlementService settlementService) {
        this.orderExecutor = orderExecutor;
        this.orderMapper = orderMapper;
        this.instrumentMapper = instrumentMapper;
        this.settlementService = settlementService;
    }
    
    /**
     * Process an ORDER_PLACED event.
     * 
     * Workflow:
     * 1. Load Order from database using orderId
     * 2. Load Instrument from database using symbol
     * 3. Execute the order using OrderExecutor
     * 4. Settle the order (DB updates + event publishing) using SettlementService
     * 
     * @param event The ORDER_PLACED event from Kafka
     */
    public void processOrderPlaced(OrderPlacedEvent event) {
        logger.info("=== EXECUTION SERVICE STARTED ===");
        logger.info("Processing ORDER_PLACED event for order {}", event.getOrderId());
        
        if (event == null || event.getOrderId() == null) {
            logger.error("Invalid ORDER_PLACED event: event is null or orderId is missing");
            throw new PermanentProcessingException("Invalid ORDER_PLACED event: event is null or orderId is missing");
        }
        
        // Parse orderId from string to Long
        Long orderId;
        try {
            orderId = Long.parseLong(event.getOrderId());
            logger.debug("Order ID parsed successfully: {}", orderId);
        } catch (NumberFormatException e) {
            logger.error("Failed to parse order ID: {}. Error: {}", event.getOrderId(), e.getMessage());
            throw new PermanentProcessingException("Invalid order ID format: " + event.getOrderId(), e);
        }
        
        Long accountId = event.getAccountId();
        if (accountId == null) {
            logger.error("Account ID is missing from order placed event for order {}", orderId);
            throw new PermanentProcessingException("Account ID is missing from order placed event");
        }
        logger.info("Account ID: {}", accountId);
        
        // Step 1: Load Order from database
        logger.info("Step 1: Loading order from database...");
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> {
                logger.error("Order not found in database: {}", orderId);
                return new PermanentProcessingException("Order not found: " + orderId);
            });
        logger.info("✓ Order loaded: quantity={}, side={}", 
                   order.getQuantity(), order.getSide());
        
        // Step 2: Load Instrument from database
        logger.info("Step 2: Loading instrument from database: {}", event.getSymbol());
        Instrument instrument = instrumentMapper.findInstrumentBySymbol(event.getSymbol())
            .orElseThrow(() -> {
                logger.error("Instrument not found: {}", event.getSymbol());
                return new PermanentProcessingException("Instrument not found: " + event.getSymbol());
            });
        logger.info("✓ Instrument loaded for symbol {}", event.getSymbol());
        
        // Step 3: Execute the order
        logger.info("Step 3: Executing order with OrderExecutor...");
        ExecutionDecision decision = orderExecutor.execute(order, instrument);
        
        logger.info("✓ Execution decision made: {}", decision);
        logger.info("  Fill status: {}", decision.isFilled());
        logger.info("  Result status: {}", decision.getResult().getStatus());
        logger.info("  Execution price: {}", decision.getResult().getExecutionPrice());
        if (decision.getResult().getReason() != null) {
            logger.info("  Reason: {}", decision.getResult().getReason());
        }
        
        // Step 4: Settle the order
        logger.info("Step 4: Settling order...");
        if (decision.isFilled()) {
            logger.info("  Order FILLED - updating account and position");
            settlementService.settleOrder(
                orderId,
                accountId,
                decision.getResult().getExecutionPrice(),
                order.getQuantity(),
                order.getSide(),
                decision.getResult()
            );
        } else if (decision.getResult().getStatus().toString().equals("REJECTED")) {
            logger.info("  Order REJECTED - updating order status");
            settlementService.settleOrder(
                orderId,
                accountId,
                null,
                order.getQuantity(),
                order.getSide(),
                decision.getResult()
            );
        } else {
            logger.warn("Execution result not FILLED or REJECTED: {}", decision.getResult().getStatus());
        }
        
        logger.info("=== EXECUTION SERVICE COMPLETED ===");
    }
}
