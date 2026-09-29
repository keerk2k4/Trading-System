package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.execution.ExecutionDecision;
import com.tradeexecutor.execution.ExecutionResult;
import com.tradeexecutor.execution.OrderExecutor;
import com.tradeexecutor.mapper.AccountMapper;
import com.tradeexecutor.mapper.InstrumentMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.mapper.PositionMapper;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;

@Service
public class ExecutionService {
    
    private static final Logger logger = LoggerFactory.getLogger(ExecutionService.class);
    
    private final OrderExecutor orderExecutor;
    private final OrderMapper orderMapper;
    private final InstrumentMapper instrumentMapper;
    private final AccountMapper accountMapper;
    private final PositionMapper positionMapper;
    private final SettlementService settlementService;
    
    public ExecutionService(OrderExecutor orderExecutor,
                           OrderMapper orderMapper,
                           InstrumentMapper instrumentMapper,
                           AccountMapper accountMapper,
                           PositionMapper positionMapper,
                           SettlementService settlementService) {
        this.orderExecutor = orderExecutor;
        this.orderMapper = orderMapper;
        this.instrumentMapper = instrumentMapper;
        this.accountMapper = accountMapper;
        this.positionMapper = positionMapper;
        this.settlementService = settlementService;
    }
    
    public void processOrderPlaced(OrderPlacedEvent event) {
        logger.info("=== EXECUTION SERVICE STARTED ===");
        logger.info("Processing ORDER_PLACED event for order {}", event.getOrderId());
        
        if (event == null || event.getOrderId() == null) {
            logger.error("Invalid ORDER_PLACED event: event is null or orderId is missing");
            throw new PermanentProcessingException("Invalid ORDER_PLACED event: event is null or orderId is missing");
        }
        
        Long orderId;
        try {
            orderId = Long.parseLong(event.getOrderId());
        } catch (NumberFormatException e) {
            logger.error("Failed to parse order ID: {}. Error: {}", event.getOrderId(), e.getMessage());
            throw new PermanentProcessingException("Invalid order ID format: " + event.getOrderId(), e);
        }
        
        Long accountId = event.getAccountId();
        if (accountId == null) {
            logger.error("Account ID is missing from order placed event for order {}", orderId);
            throw new PermanentProcessingException("Account ID is missing from order placed event");
        }
        
        Order order = orderMapper.findOrderById(orderId)
            .orElseThrow(() -> new PermanentProcessingException("Order not found: " + orderId));
        
        Instrument instrument = instrumentMapper.findInstrumentBySymbol(event.getSymbol())
            .orElseThrow(() -> new PermanentProcessingException("Instrument not found: " + event.getSymbol()));
        
        ExecutionDecision decision = orderExecutor.execute(order, instrument);
        logger.info("Execution decision for order {}: {}", orderId, decision.getResult().getStatus());
        
        if (decision.isFilled()) {
            decision = reverifyAtExecutionTime(order, accountId, decision);
        }
        
        if (decision.isFilled()) {
            settlementService.settleOrder(
                orderId, accountId, decision.getResult().getExecutionPrice(),
                order.getQuantity(), order.getSide(), decision.getResult());
        } else if (decision.getResult().getStatus() == ExecutionResult.Status.REJECTED) {
            settlementService.settleOrder(
                orderId, accountId, null,
                order.getQuantity(), order.getSide(), decision.getResult());
        } else {
            logger.warn("Execution result not FILLED or REJECTED: {}", decision.getResult().getStatus());
        }
        
        logger.info("=== EXECUTION SERVICE COMPLETED ===");
    }
    
    private ExecutionDecision reverifyAtExecutionTime(Order order, Long accountId, ExecutionDecision original) {

        Account freshAccount = accountMapper.findAccountById(accountId)
            .orElseThrow(() -> new PermanentProcessingException(
                "Account " + accountId + " not found during execution-time re-check"));

        if (freshAccount.getTradingStatus() != TradingStatus.ACTIVE) {
            logger.warn("Account {} is no longer ACTIVE (status={}) -- rejecting order {} at execution time",
                accountId, freshAccount.getTradingStatus(), order.getOrderId());
            return new ExecutionDecision(
                ExecutionResult.rejected("Account is not active: " + freshAccount.getTradingStatus()),
                original.getFillRuleName());
        }

        BigDecimal executionPrice = original.getResult().getExecutionPrice();
        BigDecimal tradeValue = executionPrice.multiply(BigDecimal.valueOf(order.getQuantity()));

        if (order.getSide() == OrderSide.BUY) {
            if (!freshAccount.canAfford(tradeValue)) {
                logger.warn("Account {} can no longer afford order {} at execution price {} (needs {})",
                    accountId, order.getOrderId(), executionPrice, tradeValue);
                return new ExecutionDecision(
                    ExecutionResult.rejected("Insufficient funds at execution time"),
                    original.getFillRuleName());
            }
        } else {
            Optional<Position> position = positionMapper.findPositionByAccountAndInstrument(
                accountId, order.getInstrument().getInstrumentId());

            int heldQuantity = position.map(Position::getQuantity).orElse(0);
            if (heldQuantity < order.getQuantity()) {
                logger.warn("Account {} no longer holds enough of instrument {} for order {} (held={}, needed={})",
                    accountId, order.getInstrument().getSymbol(), order.getOrderId(), heldQuantity, order.getQuantity());
                return new ExecutionDecision(
                    ExecutionResult.rejected("Insufficient holdings at execution time"),
                    original.getFillRuleName());
            }
        }

        return original;
    }
}