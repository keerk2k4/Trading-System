package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.ProductType;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.mapper.AccountMapper;
import com.tradeexecutor.mapper.HoldingMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.mapper.PositionMapper;
import com.tradeexecutor.mapper.SettlementJobMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

@ExtendWith(MockitoExtension.class)
@DisplayName("Deferred settlement moves settled buys from positions to holdings")
class SettlementMoveTest {

    private static final long ORDER_ID = 77L;
    private static final long ACCOUNT_ID = 7L;
    private static final long INSTRUMENT_ID = 8L;

    @Mock
    private OrderMapper orderMapper;
    @Mock
    private AccountMapper accountMapper;
    @Mock
    private PositionMapper positionMapper;
    @Mock
    private HoldingMapper holdingMapper;
    @Mock
    private SettlementJobMapper settlementJobs;
    @Mock
    private KafkaProducer kafkaProducer;

    private SettlementService service;

    @BeforeEach
    void setUp() {
        service = new SettlementService(orderMapper, accountMapper, positionMapper,
                holdingMapper, settlementJobs, kafkaProducer);
    }

    private Order filledBuy(int quantity) {
        Order order = mock(Order.class, withSettings().lenient());
        when(order.getOrderId()).thenReturn(ORDER_ID);
        when(order.getStatus()).thenReturn(OrderStatus.FILLED);
        when(order.getProductType()).thenReturn(ProductType.DELIVERY);
        when(order.getSide()).thenReturn(OrderSide.BUY);
        when(order.getQuantity()).thenReturn(quantity);
        Account account = mock(Account.class, withSettings().lenient());
        when(account.getAccountId()).thenReturn(ACCOUNT_ID);
        Instrument instrument = mock(Instrument.class, withSettings().lenient());
        when(instrument.getInstrumentId()).thenReturn(INSTRUMENT_ID);
        when(order.getAccount()).thenReturn(account);
        when(order.getInstrument()).thenReturn(instrument);
        when(orderMapper.findOrderById(ORDER_ID)).thenReturn(Optional.of(order));
        return order;
    }

    private void stubFilledPrice() {
        when(orderMapper.findFilledPrice(ORDER_ID)).thenReturn(Optional.of(new BigDecimal("50.00")));
    }

    private void stubAccount() {
        Account account = mock(Account.class, withSettings().lenient());
        when(account.getAccountId()).thenReturn(ACCOUNT_ID);
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
    }

    private Position position(long positionId, int quantity) {
        Position position = mock(Position.class, withSettings().lenient());
        when(position.getPositionId()).thenReturn(positionId);
        when(position.getQuantity()).thenReturn(quantity);
        when(position.getAveragePrice()).thenReturn(new BigDecimal("50.00"));
        return position;
    }

    @Test
    @DisplayName("Fully settled buy credits holdings and deletes the position row")
    void fullMoveDeletesPositionRow() {
        filledBuy(10);
        stubFilledPrice();
        stubAccount();
        Position settled = position(99L, 10);
        when(settlementJobs.findStatus(ORDER_ID)).thenReturn("PENDING");
        when(holdingMapper.findHoldingByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.empty());
        when(holdingMapper.insertHolding(any(Holding.class))).thenReturn(1);
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.of(settled));
        when(positionMapper.deletePosition(99L)).thenReturn(1);
        when(settlementJobs.markComplete(ORDER_ID)).thenReturn(1);

        service.applyDeferredHoldings(ORDER_ID);

        verify(holdingMapper).insertHolding(any(Holding.class));
        verify(positionMapper).deletePosition(99L);
        verify(positionMapper, never()).updatePosition(anyLong(), anyInt(), any());
        verify(settlementJobs).markComplete(ORDER_ID);
    }

    @Test
    @DisplayName("Partially settled symbol decrements the position and keeps the row")
    void partialMoveDecrementsPosition() {
        filledBuy(4);
        stubFilledPrice();
        Position settled = position(99L, 10);
        when(settlementJobs.findStatus(ORDER_ID)).thenReturn("PENDING");
        Holding existing = mock(Holding.class, withSettings().lenient());
        when(existing.getHoldingId()).thenReturn(55L);
        when(existing.getQuantity()).thenReturn(6);
        when(existing.getAveragePrice()).thenReturn(new BigDecimal("50.00"));
        when(holdingMapper.findHoldingByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.of(existing));
        when(holdingMapper.updateHolding(anyLong(), anyInt(), any())).thenReturn(1);
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.of(settled));
        when(positionMapper.updatePosition(anyLong(), anyInt(), any())).thenReturn(1);
        when(settlementJobs.markComplete(ORDER_ID)).thenReturn(1);

        service.applyDeferredHoldings(ORDER_ID);

        verify(holdingMapper).updateHolding(55L, 10, new BigDecimal("50.00"));
        verify(positionMapper).updatePosition(99L, 6, new BigDecimal("50.00"));
        verify(positionMapper, never()).deletePosition(anyLong());
        verify(settlementJobs).markComplete(ORDER_ID);
    }

    @Test
    @DisplayName("Missing position fails loudly instead of losing shares")
    void missingPositionFails() {
        filledBuy(10);
        stubFilledPrice();
        stubAccount();
        when(settlementJobs.findStatus(ORDER_ID)).thenReturn("PENDING");
        when(holdingMapper.findHoldingByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.empty());
        when(holdingMapper.insertHolding(any(Holding.class))).thenReturn(1);
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.empty());

        assertThrows(IllegalStateException.class, () -> service.applyDeferredHoldings(ORDER_ID));
        verify(settlementJobs, never()).markComplete(ORDER_ID);
    }

    @Test
    @DisplayName("Already completed jobs are a no-op")
    void completedJobIsNoOp() {
        filledBuy(10);
        when(settlementJobs.findStatus(ORDER_ID)).thenReturn("COMPLETE");

        service.applyDeferredHoldings(ORDER_ID);

        verify(holdingMapper, never()).findHoldingByAccountAndInstrument(anyLong(), anyLong());
        verify(positionMapper, never()).findPositionByAccountAndInstrument(anyLong(), anyLong());
    }
}
