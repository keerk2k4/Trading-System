package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradeexecutor.execution.ExecutionDecision;
import com.tradeexecutor.execution.OrderExecutor;
<<<<<<< HEAD
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.exception.TransientProcessingException;
=======
import com.tradeexecutor.mapper.InstrumentMapper;
import com.tradeexecutor.mapper.OrderMapper;
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68
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
<<<<<<< HEAD
     * Permanent failures (thrown as PermanentProcessingException):
     * - Event is null or invalid
     * - Order ID is null or empty
     * - Order ID does not exist in Postgres
     * - Unexpected event type
     * 
     * Transient failures (thrown as TransientProcessingException):
     * - Database connection lost
     * - Optimistic lock retry exhausted
     * 
     * TODO: In next phase:
     * - Load Order from database using orderId
     * - Load Instrument from database using symbol
     * - If order or instrument not found, handle appropriately
     * 
     * Current implementation:
     * - Validates event and order ID
     * - Creates stub Order and Instrument from event
     * - Executes the order
     * - Logs the result
=======
     * Workflow:
     * 1. Load Order from database using orderId
     * 2. Load Instrument from database using symbol
     * 3. Execute the order using OrderExecutor
     * 4. Settle the order (DB updates + event publishing) using SettlementService
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68
     * 
     * @param event The ORDER_PLACED event from Kafka
     * @throws PermanentProcessingException for permanent failures (dead-letter immediately)
     * @throws TransientProcessingException for transient failures (retry with backoff)
     */
    public void processOrderPlaced(OrderPlacedEvent event) {
        logger.info("Processing ORDER_PLACED event for order {}", 
            event != null ? event.getOrderId() : "null");
        
        // Permanent failure: null event
        if (event == null) {
            throw new PermanentProcessingException("Received null ORDER_PLACED event");
        }
        
        // Permanent failure: null or empty order ID
        if (event.getOrderId() == null || event.getOrderId().trim().isEmpty()) {
            throw new PermanentProcessingException(
                "ORDER_PLACED event missing required field: orderId"
            );
        }
        
<<<<<<< HEAD
        // TODO: Load Order from database
        // Order order = orderRepository.findById(event.getOrderId())
        //     .orElseThrow(() -> new PermanentProcessingException(
        //         "Order not found in Postgres: " + event.getOrderId()
        //     ));
        
        // TODO: Load Instrument from database
        // Instrument instrument = instrumentRepository.findBySymbol(event.getSymbol())
        //     .orElseThrow(() -> new PermanentProcessingException(
        //         "Instrument not found: " + event.getSymbol()
        //     ));
=======
        // Parse orderId from string to Long
        Long orderId;
        try {
            orderId = Long.parseLong(event.getOrderId());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid order ID format: " + event.getOrderId(), e);
        }
        
        Long accountId = event.getAccountId();
        if (accountId == null) {
            throw new IllegalArgumentException("Account ID is missing from order placed event");
        }
>>>>>>> a7686d5fc4827dd98e49875c495c1fb3edce0e68
        
        // Step 1: Load Order from database
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));
        
        // Step 2: Load Instrument from database
        Instrument instrument = instrumentMapper.findInstrumentBySymbol(event.getSymbol())
            .orElseThrow(() -> new IllegalArgumentException("Instrument not found: " + event.getSymbol()));
        
        // Step 3: Execute the order
        ExecutionDecision decision = orderExecutor.execute(order, instrument);
        logger.info("Execution decision for order {}: {}", orderId, decision);
        
        // Step 4: Settle the order
        if (decision.isFilled()) {
            settlementService.settleOrder(
                orderId,
                accountId,
                decision.getResult().getExecutionPrice(),
                order.getQuantity(),
                order.getSide(),
                decision.getResult()
            );
        } else if (decision.getResult().getStatus().toString().equals("REJECTED")) {
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
    }
}
