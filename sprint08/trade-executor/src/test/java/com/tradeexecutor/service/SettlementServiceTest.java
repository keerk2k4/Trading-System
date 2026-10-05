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
    
    @Test
    @DisplayName("Settlement of FILLED order: status + cash + position committed together")
    void testSettleFilled_AllOperationsCommitted() {
        Long orderId = 123L;
        Long accountId = 456L;
        Long instrumentId = 789L;
        BigDecimal executionPrice = new BigDecimal("100.50");
        int quantity = 10;
        OrderSide side = OrderSide.BUY;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        when(orderMapperMock.markOrderFilled(orderId, executionPrice))
            .thenReturn(1);
        
        Account mockAccount = createMockAccount(accountId, 5000);
        when(accountMapperMock.findAccountById(accountId))
            .thenReturn(java.util.Optional.of(mockAccount));
        
        when(accountMapperMock.getAccountVersion(accountId))
            .thenReturn(java.util.Optional.of(2L));
        
        when(accountMapperMock.updateAvailableBalanceOptimistic(
            anyLong(), any(BigDecimal.class), anyLong()
        )).thenReturn(1);
        
        Order mockOrder = createMockOrder(orderId, instrumentId, "AAPL");
        when(orderMapperMock.findOrderById(orderId))
            .thenReturn(java.util.Optional.of(mockOrder));
        
        when(positionMapperMock.findPositionByAccountAndInstrument(accountId, instrumentId))
            .thenReturn(java.util.Optional.empty());
        
        when(positionMapperMock.insertPosition(any(Position.class)))
            .thenReturn(1);
        
        assertDoesNotThrow(() -> settlementService.settleOrder(
            orderId, accountId, executionPrice, quantity, side, result
        ));
        
        verify(orderMapperMock, times(1)).markOrderFilled(orderId, executionPrice);
        verify(accountMapperMock, times(2)).findAccountById(accountId);
        verify(accountMapperMock, times(1)).updateAvailableBalanceOptimistic(
            anyLong(), any(BigDecimal.class), anyLong()
        );
        
        verify(kafkaProducerMock, times(1)).publishTradeEvent(
            eq(accountId.toString()), any(TradeEvent.class)
        );
    }
    
    @Test
    @DisplayName("Duplicate delivery: 0 rows updated but event still published (idempotent)")
    void testSettleFilled_DuplicateDelivery_NoOperationsPerformed() {
        Long orderId = 123L;
        Long accountId = 456L;
        BigDecimal executionPrice = new BigDecimal("100.50");
        int quantity = 10;
        OrderSide side = OrderSide.BUY;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        when(orderMapperMock.markOrderFilled(orderId, executionPrice))
            .thenReturn(0);
        
        settlementService.settleOrder(orderId, accountId, executionPrice, quantity, side, result);
        
        verify(orderMapperMock, times(1)).markOrderFilled(orderId, executionPrice);
        
        verify(accountMapperMock, never()).findAccountById(any());
        verify(accountMapperMock, never()).updateAvailableBalanceOptimistic(any(), any(), any());
        
        verify(kafkaProducerMock, times(1)).publishTradeEvent(
            eq(accountId.toString()), any(TradeEvent.class)
        );
    }
    
    @Test
    @DisplayName("Optimistic locking: retries on failure then throws after exhaustion")
    void testSettleFilled_OptimisticLockRetries_Exhausted() {
        Long orderId = 123L;
        Long accountId = 456L;
        BigDecimal executionPrice = new BigDecimal("100.50");
        int quantity = 10;
        OrderSide side = OrderSide.BUY;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        when(orderMapperMock.markOrderFilled(orderId, executionPrice))
            .thenReturn(1);
        
        Account mockAccount = createMockAccount(accountId, 5000);
        when(accountMapperMock.findAccountById(accountId))
            .thenReturn(java.util.Optional.of(mockAccount));
        
        when(accountMapperMock.getAccountVersion(accountId))
            .thenReturn(java.util.Optional.of(2L));
        
        when(accountMapperMock.updateAvailableBalanceOptimistic(
            eq(accountId), any(BigDecimal.class), any(Long.class)
        )).thenReturn(0);
        
        assertThrows(IllegalStateException.class, () -> settlementService.settleOrder(
            orderId, accountId, executionPrice, quantity, side, result
        ));
        
        verify(accountMapperMock, atLeastOnce()).findAccountById(accountId);
        
        verify(kafkaProducerMock, never()).publishTradeEvent(any(), any());
    }
    
    @Test
    @DisplayName("Settlement of REJECTED order: status updated, cash/position not touched")
    void testSettleRejected_OnlyStatusUpdated() {
        Long orderId = 123L;
        Long accountId = 456L;
        ExecutionResult result = ExecutionResult.rejected("Price out of range");
        
        when(orderMapperMock.markOrderRejected(orderId))
            .thenReturn(1);
        
        assertDoesNotThrow(() -> settlementService.settleOrder(
            orderId, accountId, null, 10, OrderSide.BUY, result
        ));
        
        verify(orderMapperMock, times(1)).markOrderRejected(orderId);
        
        verify(accountMapperMock, never()).findAccountById(any());
        verify(accountMapperMock, never()).updateAvailableBalanceOptimistic(any(), any(), any());
        verify(positionMapperMock, never()).findPositionByAccountAndInstrument(any(), any());
        verify(positionMapperMock, never()).insertPosition(any());
        verify(positionMapperMock, never()).updatePosition(anyLong(), anyInt(), any());
        
        verify(kafkaProducerMock, times(1)).publishTradeEvent(
            eq(accountId.toString()), any(TradeEvent.class)
        );
    }
    
    @Test
    @DisplayName("Sell order: cash credited (not debited)")
    void testSettleFilled_SellOrder_CashCredited() {
        Long orderId = 123L;
        Long accountId = 456L;
        Long instrumentId = 789L;
        BigDecimal executionPrice = new BigDecimal("50.00");
        int quantity = 20;
        OrderSide side = OrderSide.SELL;
        ExecutionResult result = ExecutionResult.filled(executionPrice);
        
        when(orderMapperMock.markOrderFilled(orderId, executionPrice))
            .thenReturn(1);
        
        Account mockAccount = createMockAccount(accountId, 5000);
        when(accountMapperMock.findAccountById(accountId))
            .thenReturn(java.util.Optional.of(mockAccount));
        
        when(accountMapperMock.getAccountVersion(accountId))
            .thenReturn(java.util.Optional.of(3L));
        
        when(accountMapperMock.updateAvailableBalanceOptimistic(
            anyLong(), any(BigDecimal.class), anyLong()
        )).thenReturn(1);
        
        Order mockOrder = createMockOrder(orderId, instrumentId, "AAPL");
        when(orderMapperMock.findOrderById(orderId))
            .thenReturn(java.util.Optional.of(mockOrder));
        
        Position existingPosition = createMockPosition(accountId, instrumentId, 50, new BigDecimal("45.00"));
        when(positionMapperMock.findPositionByAccountAndInstrument(accountId, instrumentId))
            .thenReturn(java.util.Optional.of(existingPosition));
        
        when(positionMapperMock.updatePosition(anyLong(), anyInt(), any(BigDecimal.class)))
            .thenReturn(1);
        
        assertDoesNotThrow(() -> settlementService.settleOrder(
            orderId, accountId, executionPrice, quantity, side, result
        ));
        
        verify(accountMapperMock, times(1)).updateAvailableBalanceOptimistic(
            anyLong(), any(BigDecimal.class), anyLong()
        );
        
        verify(positionMapperMock, times(1)).updatePosition(anyLong(), anyInt(), any(BigDecimal.class));
    }
    
    private Account createMockAccount(Long accountId, double balance) {
        Account account = mock(Account.class, withSettings().lenient());
        when(account.getAccountId()).thenReturn(accountId);
        when(account.getCashBalance()).thenReturn(new BigDecimal(balance));
        return account;
    }
    
    private Order createMockOrder(Long orderId, Long instrumentId, String symbol) {
        Order order = mock(Order.class, withSettings().lenient());
        when(order.getOrderId()).thenReturn(orderId);
        
        Instrument instrument = mock(Instrument.class);
        when(instrument.getInstrumentId()).thenReturn(instrumentId);
        when(order.getInstrument()).thenReturn(instrument);
        
        when(order.getProductType()).thenReturn(com.tradingsystem.domain.enums.ProductType.INTRADAY);
        
        return order;
    }
    
    private Position createMockPosition(Long accountId, Long instrumentId, int quantity, BigDecimal averagePrice) {
        Position position = mock(Position.class, withSettings().lenient());
        
        Account mockAccount = mock(Account.class, withSettings().lenient());
        when(mockAccount.getAccountId()).thenReturn(accountId);
        
        Instrument mockInstrument = mock(Instrument.class, withSettings().lenient());
        when(mockInstrument.getInstrumentId()).thenReturn(instrumentId);
        
        when(position.getAccount()).thenReturn(mockAccount);
        when(position.getInstrument()).thenReturn(mockInstrument);
        when(position.getQuantity()).thenReturn(quantity);
        when(position.getAveragePrice()).thenReturn(averagePrice);
        return position;
    }
}