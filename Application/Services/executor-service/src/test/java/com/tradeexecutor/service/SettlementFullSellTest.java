package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.domain.entities.User;
import com.tradeexecutor.execution.ExecutionResult;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.mapper.AccountMapper;
import com.tradeexecutor.mapper.HoldingMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.mapper.PositionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("Settlement full-sell removes the active position")
class SettlementFullSellTest {

    @Mock
    private OrderMapper orderMapper;
    @Mock
    private AccountMapper accountMapper;
    @Mock
    private PositionMapper positionMapper;
    @Mock
    private HoldingMapper holdingMapper;
    @Mock
    private KafkaProducer kafkaProducer;

    private SettlementService service;

    @BeforeEach
    void setUp() {
        service = new SettlementService(orderMapper, accountMapper, positionMapper, holdingMapper, kafkaProducer);
    }

    private Order order(Long orderId, Long accountId, Instrument instrument) {
        User user = new User("u", "A", "B", "a@b.c", null, "h", UserStatus.ACTIVE);
        Account account = new Account(accountId, "ACC-1", user, new BigDecimal("100000.00"), TradingStatus.ACTIVE, 0L);
        return new Order(orderId, account, instrument, OrderType.LIMIT, OrderSide.SELL,
                ProductType.DELIVERY, 10, new BigDecimal("100.00"), null, "key-" + orderId);
    }

    private Position position(Long positionId, Account account, Instrument instrument, int quantity) {
        return new Position(positionId, account, instrument, ProductType.DELIVERY, quantity,
                new BigDecimal("90.00"), BigDecimal.ZERO, "OPEN",
                java.time.LocalDateTime.now(), null, java.time.LocalDateTime.now());
    }

    @Test
    @DisplayName("SELL of the full quantity deletes the position and holding rows")
    void fullSellDeletesPositionAndHolding() {
        Instrument instrument = new Instrument(7L, "AAPL", "Apple Inc.", AssetClass.EQUITY, "USD");
        Order sell = order(11L, 1L, instrument);

        when(orderMapper.markOrderFilled(anyLong(), any())).thenReturn(1);
        User user = new User("u", "A", "B", "a@b.c", null, "h", UserStatus.ACTIVE);
        Account account = new Account(1L, "ACC-1", user, new BigDecimal("100000.00"), TradingStatus.ACTIVE, 0L);
        when(accountMapper.findAccountById(1L)).thenReturn(Optional.of(account));
        when(accountMapper.getAccountVersion(1L)).thenReturn(Optional.of(0L));
        when(accountMapper.updateAvailableBalanceOptimistic(anyLong(), any(), anyLong())).thenReturn(1);
        when(orderMapper.findOrderById(11L)).thenReturn(Optional.of(sell));

        Position current = position(99L, account, instrument, 10);
        when(positionMapper.findPositionByAccountAndInstrument(1L, 7L)).thenReturn(Optional.of(current));
        when(positionMapper.deletePosition(99L)).thenReturn(1);
        when(orderMapper.recordRealizedPnl(anyLong(), any(), any())).thenReturn(1);

        Holding holding = org.mockito.Mockito.mock(Holding.class);
        when(holding.getHoldingId()).thenReturn(55L);
        when(holding.getQuantity()).thenReturn(10);
        when(holding.getAveragePrice()).thenReturn(new BigDecimal("90.00"));
        when(holdingMapper.findHoldingByAccountAndInstrument(1L, 7L)).thenReturn(Optional.of(holding));
        when(holdingMapper.deleteHolding(55L)).thenReturn(1);

        service.settleOrder(11L, 1L, new BigDecimal("100.00"), 10, OrderSide.SELL,
                ExecutionResult.filled(new BigDecimal("100.00")));

        verify(positionMapper).deletePosition(99L);
        verify(positionMapper, never()).updatePosition(anyLong(), anyInt(), any());
        verify(holdingMapper).deleteHolding(55L);
        // (100.00 - 90.00 average cost) x 10
        verify(orderMapper).recordRealizedPnl(11L, new BigDecimal("90.00"), new BigDecimal("100.0000"));
    }

    @Test
    @DisplayName("Partial SELL keeps the position with reduced quantity")
    void partialSellKeepsPosition() {
        Instrument instrument = new Instrument(7L, "AAPL", "Apple Inc.", AssetClass.EQUITY, "USD");
        Order sell = order(12L, 1L, instrument);

        when(orderMapper.markOrderFilled(anyLong(), any())).thenReturn(1);
        User user = new User("u", "A", "B", "a@b.c", null, "h", UserStatus.ACTIVE);
        Account account = new Account(1L, "ACC-1", user, new BigDecimal("100000.00"), TradingStatus.ACTIVE, 0L);
        when(accountMapper.findAccountById(1L)).thenReturn(Optional.of(account));
        when(accountMapper.getAccountVersion(1L)).thenReturn(Optional.of(0L));
        when(accountMapper.updateAvailableBalanceOptimistic(anyLong(), any(), anyLong())).thenReturn(1);
        when(orderMapper.findOrderById(12L)).thenReturn(Optional.of(sell));

        Position current = position(99L, account, instrument, 10);
        when(positionMapper.findPositionByAccountAndInstrument(1L, 7L)).thenReturn(Optional.of(current));
        when(positionMapper.updatePosition(anyLong(), anyInt(), any())).thenReturn(1);
        when(orderMapper.recordRealizedPnl(anyLong(), any(), any())).thenReturn(1);

        Holding holding = org.mockito.Mockito.mock(Holding.class);
        when(holding.getHoldingId()).thenReturn(55L);
        when(holding.getQuantity()).thenReturn(10);
        when(holding.getAveragePrice()).thenReturn(new BigDecimal("90.00"));
        when(holdingMapper.findHoldingByAccountAndInstrument(1L, 7L)).thenReturn(Optional.of(holding));
        when(holdingMapper.updateHolding(anyLong(), anyInt(), any())).thenReturn(1);

        service.settleOrder(12L, 1L, new BigDecimal("100.00"), 4, OrderSide.SELL,
                ExecutionResult.filled(new BigDecimal("100.00")));

        verify(positionMapper).updatePosition(99L, 6, new BigDecimal("90.00"));
        verify(positionMapper, never()).deletePosition(anyLong());
        // (100.00 - 90.00 average cost) x 4
        verify(orderMapper).recordRealizedPnl(12L, new BigDecimal("90.00"), new BigDecimal("40.0000"));
    }
}
