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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ExecutionService validation, execution-time re-checks, and settlement routing")
class ExecutionServiceTest {

    private static final long ORDER_ID = 101L;
    private static final long ACCOUNT_ID = 202L;
    private static final long INSTRUMENT_ID = 303L;
    private static final String SYMBOL = "AAPL";

    @Mock
    private OrderExecutor orderExecutor;
    @Mock
    private OrderMapper orderMapper;
    @Mock
    private InstrumentMapper instrumentMapper;
    @Mock
    private AccountMapper accountMapper;
    @Mock
    private PositionMapper positionMapper;
    @Mock
    private SettlementService settlementService;
    @Mock
    private Order order;
    @Mock
    private Instrument instrument;
    @Mock
    private Account account;
    @Mock
    private Position position;

    private ExecutionService executionService;

    @BeforeEach
    void setUp() {
        executionService = new ExecutionService(
                orderExecutor,
                orderMapper,
                instrumentMapper,
                accountMapper,
                positionMapper,
                settlementService
        );
    }

    @Test
    @DisplayName("Missing order ID is a permanent failure before any database work")
    void missingOrderIdIsRejected() {
        OrderPlacedEvent event = event(null, ACCOUNT_ID);

        PermanentProcessingException exception = assertThrows(
                PermanentProcessingException.class,
                () -> executionService.processOrderPlaced(event)
        );

        assertEquals("Invalid ORDER_PLACED event: event is null or orderId is missing", exception.getMessage());
        assertEquals(false, exception.isRetryable());
        verifyNoInteractions(orderMapper, instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Non-numeric order ID is a permanent failure with the original value")
    void malformedOrderIdIsRejected() {
        OrderPlacedEvent event = event("not-a-number", ACCOUNT_ID);

        PermanentProcessingException exception = assertThrows(
                PermanentProcessingException.class,
                () -> executionService.processOrderPlaced(event)
        );

        assertEquals("Invalid order ID format: not-a-number", exception.getMessage());
        assertEquals(NumberFormatException.class, exception.getCause().getClass());
        assertEquals("For input string: \"not-a-number\"", exception.getCause().getMessage());
        verifyNoInteractions(orderMapper, instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Missing account ID is rejected before loading the order")
    void missingAccountIdIsRejected() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), null);

        PermanentProcessingException exception = assertThrows(
                PermanentProcessingException.class,
                () -> executionService.processOrderPlaced(event)
        );

        assertEquals("Account ID is missing from order placed event", exception.getMessage());
        verifyNoInteractions(orderMapper, instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Unknown order is dead-letterable as a permanent failure")
    void unknownOrderIsRejected() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        when(orderMapper.findOrderById(ORDER_ID)).thenReturn(Optional.empty());

        PermanentProcessingException exception = assertThrows(
                PermanentProcessingException.class,
                () -> executionService.processOrderPlaced(event)
        );

        assertEquals("Order not found: " + ORDER_ID, exception.getMessage());
        verify(orderMapper).findOrderById(ORDER_ID);
        verifyNoInteractions(instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Unknown instrument is rejected after the order is loaded")
    void unknownInstrumentIsRejected() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup();
        when(instrumentMapper.findInstrumentBySymbol(SYMBOL)).thenReturn(Optional.empty());

        PermanentProcessingException exception = assertThrows(
                PermanentProcessingException.class,
                () -> executionService.processOrderPlaced(event)
        );

        assertEquals("Instrument not found: " + SYMBOL, exception.getMessage());
        verify(orderMapper).findOrderById(ORDER_ID);
        verify(instrumentMapper).findInstrumentBySymbol(SYMBOL);
        verifyNoInteractions(orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Filled BUY is re-checked against current cash and settled with execution price")
    void filledBuyPassesExecutionTimeAffordabilityCheckAndSettles() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        BigDecimal price = new BigDecimal("25.50");
        int quantity = 4;
        OrderSide side = OrderSide.BUY;
        stubOrderLookup(quantity, side);
        stubInstrumentLookup();

        ExecutionResult filled = ExecutionResult.filled(price);
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(filled, "DEFAULT"));
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(account.getTradingStatus()).thenReturn(TradingStatus.ACTIVE);
        when(account.canAfford(any(BigDecimal.class))).thenReturn(true);

        executionService.processOrderPlaced(event);

        verify(accountMapper).findAccountById(ACCOUNT_ID);
        verify(account).canAfford(new BigDecimal("102.00"));
        verify(settlementService).settleOrder(
                ORDER_ID, ACCOUNT_ID, price, quantity, side, filled
        );
    }

    @Test
    @DisplayName("Rejected execution is settled without an execution-time account re-check")
    void rejectedDecisionIsSettledDirectly() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup(7, OrderSide.BUY);
        stubInstrumentLookup();

        ExecutionResult rejected = ExecutionResult.rejected("price outside limit");
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(rejected, "DEFAULT"));

        executionService.processOrderPlaced(event);

        verify(settlementService).settleOrder(
                ORDER_ID, ACCOUNT_ID, null, 7, OrderSide.BUY, rejected
        );
        verifyNoInteractions(accountMapper, positionMapper);
    }

    @Test
    @DisplayName("Pricing-unavailable and other non-settlement statuses do not write or settle")
    void unsupportedExecutionStatusIsIgnored() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup(2, OrderSide.BUY);
        stubInstrumentLookup();

        ExecutionResult unavailable = ExecutionResult.pricingUnavailable("quote unavailable");
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(unavailable, "DEFAULT"));

        executionService.processOrderPlaced(event);

        verify(settlementService, never()).settleOrder(any(), any(), any(), any(Integer.class), any(), any());
        verifyNoInteractions(accountMapper, positionMapper);
    }

    @Test
    @DisplayName("Filled order fails permanently if the account disappears during re-check")
    void filledOrderWithMissingExecutionTimeAccountIsPermanentFailure() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup(2, OrderSide.BUY);
        stubInstrumentLookup();
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(ExecutionResult.filled(new BigDecimal("10.00")), "DEFAULT"));
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.empty());

        PermanentProcessingException exception = assertThrows(
                PermanentProcessingException.class,
                () -> executionService.processOrderPlaced(event)
        );

        assertEquals("Account " + ACCOUNT_ID + " not found during execution-time re-check", exception.getMessage());
        verify(settlementService, never()).settleOrder(any(), any(), any(), any(Integer.class), any(), any());
    }

    @Test
    @DisplayName("Account no longer active turns a fill into a rejection")
    void inactiveExecutionTimeAccountRejectsFilledBuy() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup(3, OrderSide.BUY);
        stubInstrumentLookup();
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(ExecutionResult.filled(new BigDecimal("10.00")), "RULE"));
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(account.getTradingStatus()).thenReturn(TradingStatus.SUSPENDED);

        executionService.processOrderPlaced(event);

        ArgumentCaptor<ExecutionResult> resultCaptor = ArgumentCaptor.forClass(ExecutionResult.class);
        verify(settlementService).settleOrder(
                eq(ORDER_ID), eq(ACCOUNT_ID), eq(null), eq(3), eq(OrderSide.BUY), resultCaptor.capture()
        );
        assertEquals(ExecutionResult.Status.REJECTED, resultCaptor.getValue().getStatus());
        assertEquals("Account is not active: SUSPENDED", resultCaptor.getValue().getReason());
        verify(account, never()).canAfford(any());
    }

    @Test
    @DisplayName("Cash shortfall at execution time rejects a BUY before settlement")
    void insufficientExecutionTimeCashRejectsFilledBuy() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup(3, OrderSide.BUY);
        stubInstrumentLookup();
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(ExecutionResult.filled(new BigDecimal("10.00")), "DEFAULT"));
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(account.getTradingStatus()).thenReturn(TradingStatus.ACTIVE);
        when(account.canAfford(any(BigDecimal.class))).thenReturn(false);

        executionService.processOrderPlaced(event);

        ArgumentCaptor<ExecutionResult> resultCaptor = ArgumentCaptor.forClass(ExecutionResult.class);
        verify(settlementService).settleOrder(
                eq(ORDER_ID), eq(ACCOUNT_ID), eq(null), eq(3), eq(OrderSide.BUY), resultCaptor.capture()
        );
        assertEquals(ExecutionResult.Status.REJECTED, resultCaptor.getValue().getStatus());
        assertEquals("Insufficient funds at execution time", resultCaptor.getValue().getReason());
    }

    @Test
    @DisplayName("SELL is re-checked against current holdings and retains the original fill")
    void filledSellPassesExecutionTimeHoldingsCheck() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        BigDecimal price = new BigDecimal("30.00");
        int quantity = 2;
        OrderSide side = OrderSide.SELL;
        stubOrderLookup(quantity, side);
        stubInstrumentLookup();
        when(order.getInstrument()).thenReturn(instrument);
        when(instrument.getInstrumentId()).thenReturn(INSTRUMENT_ID);

        ExecutionResult filled = ExecutionResult.filled(price);
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(filled, "DEFAULT"));
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(account.getTradingStatus()).thenReturn(TradingStatus.ACTIVE);
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.of(position));
        when(position.getQuantity()).thenReturn(5);

        executionService.processOrderPlaced(event);

        verify(positionMapper).findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID);
        verify(settlementService).settleOrder(
                ORDER_ID, ACCOUNT_ID, price, quantity, side, filled
        );
    }

    @Test
    @DisplayName("Missing or insufficient execution-time holdings reject a SELL")
    void insufficientExecutionTimeHoldingsRejectFilledSell() {
        OrderPlacedEvent event = event(String.valueOf(ORDER_ID), ACCOUNT_ID);
        stubOrderLookup(2, OrderSide.SELL);
        stubInstrumentLookup();
        when(order.getInstrument()).thenReturn(instrument);
        when(instrument.getInstrumentId()).thenReturn(INSTRUMENT_ID);
        when(orderExecutor.execute(order, instrument))
                .thenReturn(new ExecutionDecision(ExecutionResult.filled(new BigDecimal("30.00")), "DEFAULT"));
        when(accountMapper.findAccountById(ACCOUNT_ID)).thenReturn(Optional.of(account));
        when(account.getTradingStatus()).thenReturn(TradingStatus.ACTIVE);
        when(positionMapper.findPositionByAccountAndInstrument(ACCOUNT_ID, INSTRUMENT_ID))
                .thenReturn(Optional.of(position));
        when(position.getQuantity()).thenReturn(1);

        executionService.processOrderPlaced(event);

        ArgumentCaptor<ExecutionResult> resultCaptor = ArgumentCaptor.forClass(ExecutionResult.class);
        verify(settlementService).settleOrder(
                eq(ORDER_ID), eq(ACCOUNT_ID), eq(null), eq(2), eq(OrderSide.SELL), resultCaptor.capture()
        );
        assertEquals(ExecutionResult.Status.REJECTED, resultCaptor.getValue().getStatus());
        assertEquals("Insufficient holdings at execution time", resultCaptor.getValue().getReason());
    }

    private OrderPlacedEvent event(String orderId, Long accountId) {
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId(orderId);
        event.setAccountId(accountId);
        event.setSymbol(SYMBOL);
        event.setSide("BUY");
        event.setQuantity(1);
        event.setPrice(new BigDecimal("10.00"));
        return event;
    }

    private void stubOrderLookup() {
        lenient().when(order.getOrderId()).thenReturn(ORDER_ID);
        lenient().when(order.getQuantity()).thenReturn(1);
        lenient().when(order.getSide()).thenReturn(OrderSide.BUY);
        when(orderMapper.findOrderById(ORDER_ID)).thenReturn(Optional.of(order));
    }

    private void stubOrderLookup(int quantity, OrderSide side) {
        stubOrderLookup();
        lenient().when(order.getQuantity()).thenReturn(quantity);
        lenient().when(order.getSide()).thenReturn(side);
    }

    private void stubInstrumentLookup() {
        lenient().when(instrument.getSymbol()).thenReturn(SYMBOL);
        when(instrumentMapper.findInstrumentBySymbol(SYMBOL)).thenReturn(Optional.of(instrument));
    }
}
