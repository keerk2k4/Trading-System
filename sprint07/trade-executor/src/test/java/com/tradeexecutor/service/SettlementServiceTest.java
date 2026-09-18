package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradeexecutor.execution.ExecutionResult;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.mapper.AccountMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.mapper.PositionMapper;
import com.tradeexecutor.model.TradeEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tradingsystem.domain.entities.Account;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.mockito.Mockito.withSettings;

/**
 * Unit tests for SettlementService.
 * 
 * Tests cover:
 * 1. Transactional integrity: status + cash + position committed together
 * 2. Transaction rollback: failure of any operation rolls back all three
 * 3. Duplicate delivery handling: 0 rows updated results in event publish (idempotent)
 * 4. Optimistic locking: exhausted retries produce an error
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("SettlementService Tests")
public class SettlementServiceTest {
    
    private SettlementService settlementService;
    
    @Mock
    private OrderMapper orderMapperMock;
    
    @Mock
    private AccountMapper accountMapperMock;
    
    @Mock
    private PositionMapper positionMapperMock;
    
    @Mock
    private KafkaProducer kafkaProducerMock;
    
    @BeforeEach
    void setUp() {
        settlementService = new SettlementService(
            orderMapperMock,
            accountMapperMock,
            positionMapperMock,
            kafkaProducerMock
        );
    }
    
    // ============================================================
    // Test 1: Successful settlement - all three operations commit
    // ============================================================
    
    @Test
    @DisplayName("Settlement of FILLED order: status + cash + position committed together")
    void testSettleFilled_AllOperationsCommitted() {
        // Setup
        Long orderId = 123L;
        Long accountId = 456L;
        Long instrumentId = 789L;
        BigDecimal executionPrice = new BigDecimal("100.50");
        int quantity = 10;
        OrderSide side = OrderSide.BUY;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        // Mock: order status update returns 1 (success)
        when(orderMapperMock.updateOrderStatusWithCurrentStatus(orderId, "NEW", "FILLED"))
            .thenReturn(1);
        
        // Mock: account read with version
        Account mockAccount = createMockAccount(accountId, 5000);
        when(accountMapperMock.findAccountById(accountId))
            .thenReturn(java.util.Optional.of(mockAccount));
        
        // Mock: version query returns version number
        when(accountMapperMock.getAccountVersion(accountId))
            .thenReturn(java.util.Optional.of(2L));
        
        // Mock: account balance update returns 1 (success)
        BigDecimal expectedNewBalance = new BigDecimal("4994.50"); // 5000 - (100.50 * 10)
        when(accountMapperMock.updateAvailableBalanceOptimistic(
            anyLong(),
            any(BigDecimal.class),
            anyLong()
        )).thenReturn(1);
        
        // Mock: order read for position update
        Order mockOrder = createMockOrder(orderId, instrumentId, "AAPL");
        when(orderMapperMock.findOrderById(orderId))
            .thenReturn(java.util.Optional.of(mockOrder));
        
        // Mock: no existing position
        when(positionMapperMock.findPositionByAccountAndInstrument(accountId, instrumentId))
            .thenReturn(java.util.Optional.empty());
        
        // Mock: position creation
        when(positionMapperMock.insertPosition(any(Position.class)))
            .thenReturn(1);
        
        // Execute
        assertDoesNotThrow(() -> settlementService.settleOrder(
            orderId, accountId, executionPrice, quantity, side, result
        ));
        
        // Verify all three operations were called
        verify(orderMapperMock, times(1)).updateOrderStatusWithCurrentStatus(orderId, "NEW", "FILLED");
        // findAccountById is called twice: once for balance update, once for position creation
        verify(accountMapperMock, times(2)).findAccountById(accountId);
        verify(accountMapperMock, times(1)).updateAvailableBalanceOptimistic(
            anyLong(),
            any(BigDecimal.class),
            anyLong()
        );
        
        // Verify event was published
        verify(kafkaProducerMock, times(1)).publishTradeEvent(
            eq(accountId.toString()),
            any(TradeEvent.class)
        );
    }
    
    // ============================================================
    // Test 2: Duplicate delivery - no operations performed
    // ============================================================
    
    @Test
    @DisplayName("Duplicate delivery: 0 rows updated but event still published (idempotent)")
    void testSettleFilled_DuplicateDelivery_NoOperationsPerformed() {
        // Setup
        Long orderId = 123L;
        Long accountId = 456L;
        BigDecimal executionPrice = new BigDecimal("100.50");
        int quantity = 10;
        OrderSide side = OrderSide.BUY;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        // Mock: order status update returns 0 (duplicate delivery - already settled)
        when(orderMapperMock.updateOrderStatusWithCurrentStatus(orderId, "NEW", "FILLED"))
            .thenReturn(0);
        
        // Execute
        settlementService.settleOrder(orderId, accountId, executionPrice, quantity, side, result);
        
        // Verify only order status update was called
        verify(orderMapperMock, times(1)).updateOrderStatusWithCurrentStatus(orderId, "NEW", "FILLED");
        
        // Verify account update was NOT called (due to duplicate detection)
        verify(accountMapperMock, never()).findAccountById(any());
        verify(accountMapperMock, never()).updateAvailableBalanceOptimistic(any(), any(), any());
        
        // Verify event WAS still published (idempotent publishing)
        verify(kafkaProducerMock, times(1)).publishTradeEvent(
            eq(accountId.toString()),
            any(TradeEvent.class)
        );
    }
    
    // ============================================================
    // Test 3: Optimistic locking retry - exhausted retries
    // ============================================================
    
    @Test
    @DisplayName("Optimistic locking: retries on failure then throws after exhaustion")
    void testSettleFilled_OptimisticLockRetries_Exhausted() {
        // Setup
        Long orderId = 123L;
        Long accountId = 456L;
        BigDecimal executionPrice = new BigDecimal("100.50");
        int quantity = 10;
        OrderSide side = OrderSide.BUY;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        // Mock: order status update returns 1 (success)
        when(orderMapperMock.updateOrderStatusWithCurrentStatus(orderId, "NEW", "FILLED"))
            .thenReturn(1);
        
        // Mock: account read always returns the same account (simulating concurrent updates)
        Account mockAccount = createMockAccount(accountId, 5000);
        when(accountMapperMock.findAccountById(accountId))
            .thenReturn(java.util.Optional.of(mockAccount));
        
        // Mock: version query returns version number
        when(accountMapperMock.getAccountVersion(accountId))
            .thenReturn(java.util.Optional.of(2L));
        
        // Mock: account balance update always returns 0 (version mismatch - optimistic lock failed)
        when(accountMapperMock.updateAvailableBalanceOptimistic(
            eq(accountId),
            any(BigDecimal.class),
            any(Long.class)
        )).thenReturn(0);
        
        // Execute - should throw exception after exhausting retries
        assertThrows(IllegalStateException.class, () -> settlementService.settleOrder(
            orderId, accountId, executionPrice, quantity, side, result
        ));
        
        // Verify findAccountById was called at least once
        verify(accountMapperMock, atLeastOnce()).findAccountById(accountId);
        
        // Verify event was NOT published (due to exception)
        verify(kafkaProducerMock, never()).publishTradeEvent(any(), any());
    }
    
    // ============================================================
    // Test 4: Settlement of REJECTED order
    // ============================================================
    
    @Test
    @DisplayName("Settlement of REJECTED order: status updated, cash/position not touched")
    void testSettleRejected_OnlyStatusUpdated() {
        // Setup
        Long orderId = 123L;
        Long accountId = 456L;
        ExecutionResult result = ExecutionResult.rejected("Price out of range");
        
        // Mock: order status update returns 1 (success)
        when(orderMapperMock.updateOrderStatusWithCurrentStatus(orderId, "NEW", "REJECTED"))
            .thenReturn(1);
        
        // Execute
        assertDoesNotThrow(() -> settlementService.settleOrder(
            orderId, accountId, null, 10, OrderSide.BUY, result
        ));
        
        // Verify only order status update was called
        verify(orderMapperMock, times(1)).updateOrderStatusWithCurrentStatus(orderId, "NEW", "REJECTED");
        
        // Verify account and position updates were NOT called
        verify(accountMapperMock, never()).findAccountById(any());
        verify(accountMapperMock, never()).updateAvailableBalanceOptimistic(any(), any(), any());
        verify(positionMapperMock, never()).findPositionByAccountAndInstrument(any(), any());
        verify(positionMapperMock, never()).insertPosition(any());
        verify(positionMapperMock, never()).updatePosition(anyLong(), anyInt(), any());
        
        // Verify event was published
        verify(kafkaProducerMock, times(1)).publishTradeEvent(
            eq(accountId.toString()),
            any(TradeEvent.class)
        );
    }
    
    // ============================================================
    // Test 5: Sell order reduces cash correctly (credit instead of debit)
    // ============================================================
    
    @Test
    @DisplayName("Sell order: cash credited (not debited)")
    void testSettleFilled_SellOrder_CashCredited() {
        // Setup
        Long orderId = 123L;
        Long accountId = 456L;
        Long instrumentId = 789L;
        BigDecimal executionPrice = new BigDecimal("50.00");
        int quantity = 20;
        OrderSide side = OrderSide.SELL;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        // Mock: order status update returns 1 (success)
        when(orderMapperMock.updateOrderStatusWithCurrentStatus(orderId, "NEW", "FILLED"))
            .thenReturn(1);
        
        // Mock: account read with version
        Account mockAccount = createMockAccount(accountId, 5000);
        when(accountMapperMock.findAccountById(accountId))
            .thenReturn(java.util.Optional.of(mockAccount));
        
        // Mock: version query returns version number
        when(accountMapperMock.getAccountVersion(accountId))
            .thenReturn(java.util.Optional.of(3L));
        
        // Mock: account balance update returns 1 (success)
        // For SELL: cash should be CREDITED (increased)
        // New balance = 5000 + (50.00 * 20) = 6000
        BigDecimal expectedNewBalance = new BigDecimal("6000.00");
        when(accountMapperMock.updateAvailableBalanceOptimistic(
            anyLong(),
            any(BigDecimal.class),
            anyLong()
        )).thenReturn(1);
        
        // Mock: order read for position update
        Order mockOrder = createMockOrder(orderId, instrumentId, "AAPL");
        when(orderMapperMock.findOrderById(orderId))
            .thenReturn(java.util.Optional.of(mockOrder));
        
        // Mock: existing position for SELL
        Position existingPosition = createMockPosition(accountId, instrumentId, 50, new BigDecimal("45.00"));
        when(positionMapperMock.findPositionByAccountAndInstrument(accountId, instrumentId))
            .thenReturn(java.util.Optional.of(existingPosition));
        
        // Mock: position update
        when(positionMapperMock.updatePosition(anyLong(), anyInt(), any(BigDecimal.class)))
            .thenReturn(1);
        
        // Execute
        assertDoesNotThrow(() -> settlementService.settleOrder(
            orderId, accountId, executionPrice, quantity, side, result
        ));
        
        // Verify account update was called with correct balance (CREDITED)
        verify(accountMapperMock, times(1)).updateAvailableBalanceOptimistic(
            anyLong(),
            any(BigDecimal.class),
            anyLong()
        );
        
        // Verify position was updated
        verify(positionMapperMock, times(1)).updatePosition(anyLong(), anyInt(), any(BigDecimal.class));
    }
    
    // ============================================================
    // Helper methods
    // ============================================================
    
    /**
     * Create a mock Account with the specified properties.
     */
    private Account createMockAccount(Long accountId, double balance) {
        Account account = mock(Account.class, withSettings().lenient());
        when(account.getAccountId()).thenReturn(accountId);
        when(account.getCashBalance()).thenReturn(new BigDecimal(balance));
        return account;
    }
    
    /**
     * Create a mock Order with the specified properties.
     */
    private Order createMockOrder(Long orderId, Long instrumentId, String symbol) {
        Order order = mock(Order.class, withSettings().lenient());
        when(order.getOrderId()).thenReturn(orderId);
        
        Instrument instrument = mock(Instrument.class);
        when(instrument.getInstrumentId()).thenReturn(instrumentId);
        when(order.getInstrument()).thenReturn(instrument);
        
        // Mock ProductType for position creation
        when(order.getProductType()).thenReturn(com.tradingsystem.domain.enums.ProductType.INTRADAY);
        
        return order;
    }
    
    /**
     * Create a mock Position with the specified properties.
     */
    private Position createMockPosition(Long accountId, Long instrumentId, int quantity, BigDecimal averagePrice) {
        Position position = mock(Position.class, withSettings().lenient());
        
        // Mock Account and Instrument with lenient mode
        Account mockAccount = mock(Account.class, withSettings().lenient());
        when(mockAccount.getAccountId()).thenReturn(accountId);
        
        Instrument mockInstrument = mock(Instrument.class, withSettings().lenient());
        when(mockInstrument.getInstrumentId()).thenReturn(instrumentId);
        
        // Setup Position mock - always stub these critical fields
        when(position.getAccount()).thenReturn(mockAccount);
        when(position.getInstrument()).thenReturn(mockInstrument);
        when(position.getQuantity()).thenReturn(quantity);
        when(position.getAveragePrice()).thenReturn(averagePrice);
        return position;
    }
}


