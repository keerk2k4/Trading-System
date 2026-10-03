package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("SettlementService edge cases and persistence invariants")
class SettlementServiceEdgeCaseTest {

    private static final long ORDER_ID = 11L;
    private static final long ACCOUNT_ID = 22L;
    private static final long INSTRUMENT_ID = 33L;
    private static final long POSITION_ID = 44L;

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

    private SettlementService settlementService;

    @BeforeEach
    void setUp() {
        settlementService = new SettlementService(orderMapper, accountMapper, positionMapper, holdingMapper, kafkaProducer);
        ReflectionTestUtils.setField(settlementService, "maxOptimisticLockRetries", 0);
    }

    @Test
    @DisplayName("Unsupported execution statuses return without touching persistence or Kafka")
    void unsupportedStatusIsANoOp() {
        settlementService.settleOrder(
                ORDER_ID,
                ACCOUNT_ID,
                new BigDecimal("10.00"),
                1,
                OrderSide.BUY,
                ExecutionResult.pricingUnavailable("no quote")
        );

        verifyNoInteractions(orderMapper, accountMapper, positionMapper, kafkaProducer);
    }

    @Test
    @DisplayName("Missing account during filled settlement fails before version lookup")
    void missingAccountFillsFails() {
        when(orderMapper.markOrderFilled(ORDER_ID, new BigDecimal("10.00"))).thenReturn(1);
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.empty());

        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> settleFilled(OrderSide.BUY, 1, new BigDecimal("10.00"))
        );

        assertEquals("Account " + ACCOUNT_ID + " not found", exception.getMessage());
        verify(orderMapper, never()).findOrderById(anyLong());
        verify(kafkaProducer, never()).publishTradeEvent(any(), any());
    }

    @Test
    @DisplayName("Missing account version fails with a clear error")
    void missingAccountVersionFails() {
        Account account = account(new BigDecimal("100.00"));
        when(orderMapper.markOrderFilled(ORDER_ID, new BigDecimal("10.00"))).thenReturn(1);
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(accountMapper.getAccountVersion(ACCOUNT_ID)).thenReturn(Optional.empty());

        IllegalArgumentException exception = assertThrows(
                IllegalArgumentException.class,
                () -> settleFilled(OrderSide.BUY, 1, new BigDecimal("10.00"))
        );

        assertEquals("Account " + ACCOUNT_ID + " version not found", exception.getMessage());
        verify(accountMapper, never()).updateAvailableBalanceOptimistic(anyLong(), any(), anyLong());
    }

    @Test
    @DisplayName("Optimistic locking retries a lost update and succeeds on a later version")
    void optimisticLockRecoveryRetriesAndSettles() {
        ReflectionTestUtils.setField(settlementService, "maxOptimisticLockRetries", 2);
        Account account = account(new BigDecimal("100.00"));
        Order order = order(OrderSide.BUY, 1);
        when(orderMapper.markOrderFilled(ORDER_ID, new BigDecimal("10.00"))).thenReturn(1);
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(accountMapper.getAccountVersion(ACCOUNT_ID)).thenReturn(Optional.of(1L), Optional.of(2L));
        when(accountMapper.updateAvailableBalanceOptimistic(ACCOUNT_ID, new BigDecimal("90.00"), 1L))
                .thenReturn(0);
        when(accountMapper.updateAvailableBalanceOptimistic(ACCOUNT_ID, new BigDecimal("90.00"), 2L))
                .thenReturn(1);
        when(orderMapper.findOrderById(ORDER_ID)).thenReturn(Optional.of(order));
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.empty());
        when(positionMapper.nextPositionId()).thenReturn(POSITION_ID);
        when(positionMapper.insertPosition(any(Position.class))).thenReturn(1);

        settlementService.settleOrder(
                ORDER_ID, ACCOUNT_ID, new BigDecimal("10.00"), 1, OrderSide.BUY,
                ExecutionResult.filled(new BigDecimal("10.00"))
        );

        verify(accountMapper).updateAvailableBalanceOptimistic(ACCOUNT_ID, new BigDecimal("90.00"), 1L);
        verify(accountMapper).updateAvailableBalanceOptimistic(ACCOUNT_ID, new BigDecimal("90.00"), 2L);
        verify(kafkaProducer).publishTradeEvent(any(), any());
    }

    @Test
    @DisplayName("BUY on an existing position uses a weighted average cost")
    void buyUpdatesExistingPositionAverage() {
        Order order = order(OrderSide.BUY, 3);
        Account account = account(new BigDecimal("1000.00"));
        Position position = position(2, new BigDecimal("10.00"));
        stubFilledPersistence(order, account, Optional.of(position));
        when(positionMapper.updatePosition(POSITION_ID, 5, new BigDecimal("16.00"))).thenReturn(1);

        settlementService.settleOrder(
                ORDER_ID, ACCOUNT_ID, new BigDecimal("20.00"), 3, OrderSide.BUY,
                ExecutionResult.filled(new BigDecimal("20.00"))
        );

        verify(accountMapper).updateAvailableBalanceOptimistic(ACCOUNT_ID, new BigDecimal("940.00"), 1L);
        verify(positionMapper).updatePosition(POSITION_ID, 5, new BigDecimal("16.00"));
        verify(kafkaProducer).publishTradeEvent(any(), any());
    }

    @Test
    @DisplayName("SELL on an existing position credits cash and preserves average cost")
    void sellUpdatesExistingPositionAndCreditsCash() {
        Order order = order(OrderSide.SELL, 2);
        Account account = account(new BigDecimal("1000.00"));
        Position position = position(5, new BigDecimal("10.00"));
        stubFilledPersistence(order, account, Optional.of(position));
        when(positionMapper.updatePosition(POSITION_ID, 3, new BigDecimal("10.00"))).thenReturn(1);

        settlementService.settleOrder(
                ORDER_ID, ACCOUNT_ID, new BigDecimal("20.00"), 2, OrderSide.SELL,
                ExecutionResult.filled(new BigDecimal("20.00"))
        );

        verify(accountMapper).updateAvailableBalanceOptimistic(ACCOUNT_ID, new BigDecimal("1040.00"), 1L);
        verify(positionMapper).updatePosition(POSITION_ID, 3, new BigDecimal("10.00"));
    }

    @Test
    @DisplayName("SELL without an existing position fails instead of creating a short position")
    void sellWithoutPositionFails() {
        Order order = order(OrderSide.SELL, 1);
        Account account = account(new BigDecimal("1000.00"));
        stubFilledPersistence(order, account, Optional.empty());

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> settlementService.settleOrder(
                        ORDER_ID, ACCOUNT_ID, new BigDecimal("20.00"), 1, OrderSide.SELL,
                        ExecutionResult.filled(new BigDecimal("20.00"))
                )
        );

        assertTrue(exception.getMessage().contains("No existing position to SELL"));
        verify(kafkaProducer, never()).publishTradeEvent(any(), any());
    }

    @Test
    @DisplayName("A failed new-position insert aborts settlement")
    void failedPositionInsertAbortsSettlement() {
        Order order = order(OrderSide.BUY, 1);
        Account account = account(new BigDecimal("100.00"));
        stubFilledPersistence(order, account, Optional.empty());
        when(positionMapper.nextPositionId()).thenReturn(POSITION_ID);
        when(positionMapper.insertPosition(any(Position.class))).thenReturn(0);

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> settlementService.settleOrder(
                        ORDER_ID, ACCOUNT_ID, new BigDecimal("10.00"), 1, OrderSide.BUY,
                        ExecutionResult.filled(new BigDecimal("10.00"))
                )
        );

        assertTrue(exception.getMessage().contains("Failed to create position"));
        verify(kafkaProducer, never()).publishTradeEvent(any(), any());
    }

    @Test
    @DisplayName("A failed existing-position update aborts settlement")
    void failedPositionUpdateAbortsSettlement() {
        Order order = order(OrderSide.BUY, 1);
        Account account = account(new BigDecimal("100.00"));
        Position position = position(2, new BigDecimal("10.00"));
        stubFilledPersistence(order, account, Optional.of(position));
        when(positionMapper.updatePosition(POSITION_ID, 3, new BigDecimal("10.00"))).thenReturn(0);

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> settlementService.settleOrder(
                        ORDER_ID, ACCOUNT_ID, new BigDecimal("10.00"), 1, OrderSide.BUY,
                        ExecutionResult.filled(new BigDecimal("10.00"))
                )
        );

        assertTrue(exception.getMessage().contains("Failed to update position"));
        verify(kafkaProducer, never()).publishTradeEvent(any(), any());
    }

    @Test
    @DisplayName("Kafka publication failure is surfaced to the caller")
    void publicationFailureIsPropagated() {
        when(orderMapper.markOrderRejected(ORDER_ID)).thenReturn(1);
        doThrow(new IllegalStateException("broker down")).when(kafkaProducer).publishTradeEvent(any(), any());

        RuntimeException exception = assertThrows(
                RuntimeException.class,
                () -> settlementService.settleOrder(
                        ORDER_ID, ACCOUNT_ID, null, 1, OrderSide.BUY,
                        ExecutionResult.rejected("not marketable")
                )
        );

        assertEquals("Failed to publish trade event", exception.getMessage());
        assertEquals("broker down", exception.getCause().getMessage());
    }

    @Test
    @DisplayName("A duplicate rejected delivery does not repeat account or position writes")
    void duplicateRejectedDeliverySkipsSideEffects() {
        when(orderMapper.markOrderRejected(ORDER_ID)).thenReturn(0);

        settlementService.settleOrder(
                ORDER_ID, ACCOUNT_ID, null, 1, OrderSide.BUY, ExecutionResult.rejected("duplicate")
        );

        verifyNoInteractions(accountMapper, positionMapper);
        verify(kafkaProducer).publishTradeEvent(any(), any());
    }

    private void settleFilled(OrderSide side, int quantity, BigDecimal price) {
        settlementService.settleOrder(
                ORDER_ID, ACCOUNT_ID, price, quantity, side, ExecutionResult.filled(price)
        );
    }

    private void stubFilledPersistence(Order order, Account account, Optional<Position> existingPosition) {
        when(orderMapper.markOrderFilled(eq(ORDER_ID), any(BigDecimal.class))).thenReturn(1);
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(accountMapper.getAccountVersion(ACCOUNT_ID)).thenReturn(Optional.of(1L));
        when(accountMapper.updateAvailableBalanceOptimistic(eq(ACCOUNT_ID), any(BigDecimal.class), eq(1L)))
                .thenReturn(1);
        when(orderMapper.findOrderById(ORDER_ID)).thenReturn(Optional.of(order));
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(existingPosition);
    }

    private Account account(BigDecimal balance) {
        Account account = org.mockito.Mockito.mock(Account.class);
        when(account.getCashBalance()).thenReturn(balance);
        return account;
    }

    private Order order(OrderSide side, int quantity) {
        Order order = org.mockito.Mockito.mock(Order.class);
        Instrument instrument = org.mockito.Mockito.mock(Instrument.class);
        lenient().when(order.getOrderId()).thenReturn(ORDER_ID);
        lenient().when(order.getQuantity()).thenReturn(quantity);
        lenient().when(order.getSide()).thenReturn(side);
        lenient().when(order.getInstrument()).thenReturn(instrument);
        lenient().when(order.getProductType()).thenReturn(ProductType.INTRADAY);
        lenient().when(instrument.getInstrumentId()).thenReturn(INSTRUMENT_ID);
        return order;
    }

    private Position position(int quantity, BigDecimal averagePrice) {
        Position position = org.mockito.Mockito.mock(Position.class);
        when(position.getPositionId()).thenReturn(POSITION_ID);
        when(position.getQuantity()).thenReturn(quantity);
        when(position.getAveragePrice()).thenReturn(averagePrice);
        return position;
    }

}
