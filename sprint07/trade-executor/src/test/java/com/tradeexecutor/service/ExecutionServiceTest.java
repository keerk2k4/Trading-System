package com.tradeexecutor.service;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradeexecutor.exception.PermanentProcessingException;
import com.tradeexecutor.execution.ExecutionDecision;
import com.tradeexecutor.execution.ExecutionResult;
import com.tradeexecutor.execution.OrderExecutor;
import com.tradeexecutor.mapper.InstrumentMapper;
import com.tradeexecutor.mapper.OrderMapper;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for ExecutionService validation and orchestration.
 */
@DisplayName("ExecutionService Validation Tests")
@ExtendWith(MockitoExtension.class)
class ExecutionServiceTest {

    @Mock
    private OrderExecutor orderExecutor;

    @Mock
    private OrderMapper orderMapper;

    @Mock
    private InstrumentMapper instrumentMapper;

    @Mock
    private SettlementService settlementService;

    @Mock
    private Order mockOrder;

    @Mock
    private Instrument mockInstrument;

    private ExecutionService executionService;

    @BeforeEach
    void setUp() {
        executionService = new ExecutionService(
            orderExecutor, orderMapper, instrumentMapper, settlementService);
    }

    @Test
    @DisplayName("Throws PermanentProcessingException when event is null")
    void testThrowsExceptionWhenEventIsNull() {
        PermanentProcessingException exception = assertThrows(
            PermanentProcessingException.class,
            () -> executionService.processOrderPlaced(null)
        );

        assertTrue(exception.getFailureReason().contains("null"));
        verifyNoInteractions(orderMapper, instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Throws PermanentProcessingException when orderId is null")
    void testThrowsExceptionWhenOrderIdIsNull() {
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId(null);
        event.setAccountId(1L);
        event.setSymbol("AAPL");

        PermanentProcessingException exception = assertThrows(
            PermanentProcessingException.class,
            () -> executionService.processOrderPlaced(event)
        );

        assertTrue(exception.getFailureReason().contains("orderId"));
        verifyNoInteractions(orderMapper, instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Throws PermanentProcessingException when orderId is empty")
    void testThrowsExceptionWhenOrderIdIsEmpty() {
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId("   ");
        event.setAccountId(1L);
        event.setSymbol("AAPL");

        PermanentProcessingException exception = assertThrows(
            PermanentProcessingException.class,
            () -> executionService.processOrderPlaced(event)
        );

        assertTrue(exception.getFailureReason().contains("orderId"));
        verifyNoInteractions(orderMapper, instrumentMapper, orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Throws IllegalArgumentException when orderId is not numeric")
    void testThrowsExceptionWhenOrderIdNotNumeric() {
        OrderPlacedEvent event = validEvent("order-123");

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> executionService.processOrderPlaced(event)
        );

        assertTrue(exception.getMessage().contains("Invalid order ID format"));
    }

    @Test
    @DisplayName("Throws IllegalArgumentException when accountId is missing")
    void testThrowsExceptionWhenAccountIdMissing() {
        OrderPlacedEvent event = validEvent("123");
        event.setAccountId(null);

        assertThrows(
            IllegalArgumentException.class,
            () -> executionService.processOrderPlaced(event)
        );
    }

    @Test
    @DisplayName("Throws IllegalArgumentException when order is not found")
    void testThrowsExceptionWhenOrderNotFound() {
        OrderPlacedEvent event = validEvent("123");
        when(orderMapper.findOrderById(123L)).thenReturn(Optional.empty());

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> executionService.processOrderPlaced(event)
        );

        assertTrue(exception.getMessage().contains("Order not found"));
        verify(orderMapper, times(1)).findOrderById(123L);
        verifyNoInteractions(orderExecutor, settlementService);
    }

    @Test
    @DisplayName("Throws IllegalArgumentException when instrument is not found")
    void testThrowsExceptionWhenInstrumentNotFound() {
        OrderPlacedEvent event = validEvent("123");
        when(orderMapper.findOrderById(123L)).thenReturn(Optional.of(mockOrder));
        when(instrumentMapper.findInstrumentBySymbol("AAPL")).thenReturn(Optional.empty());

        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> executionService.processOrderPlaced(event)
        );

        assertTrue(exception.getMessage().contains("Instrument not found"));
        verifyNoInteractions(orderExecutor, settlementService);
    }

    @Test
    @DisplayName("FILLED decision settles with execution price")
    void testFilledDecisionSettlesOrder() {
        OrderPlacedEvent event = validEvent("123");
        when(orderMapper.findOrderById(123L)).thenReturn(Optional.of(mockOrder));
        when(instrumentMapper.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(mockInstrument));
        when(mockOrder.getQuantity()).thenReturn(100);
        when(mockOrder.getSide()).thenReturn(OrderSide.BUY);
        ExecutionResult result = ExecutionResult.filled(new BigDecimal("145.00"));
        when(orderExecutor.execute(mockOrder, mockInstrument))
            .thenReturn(new ExecutionDecision(result, "DEFAULT"));

        assertDoesNotThrow(() -> executionService.processOrderPlaced(event));

        verify(orderExecutor, times(1)).execute(mockOrder, mockInstrument);
        verify(settlementService, times(1)).settleOrder(
            eq(123L), eq(1L), eq(new BigDecimal("145.00")),
            eq(100), eq(OrderSide.BUY), eq(result));
    }

    @Test
    @DisplayName("REJECTED decision settles with null execution price")
    void testRejectedDecisionSettlesOrder() {
        OrderPlacedEvent event = validEvent("123");
        when(orderMapper.findOrderById(123L)).thenReturn(Optional.of(mockOrder));
        when(instrumentMapper.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(mockInstrument));
        when(mockOrder.getQuantity()).thenReturn(100);
        when(mockOrder.getSide()).thenReturn(OrderSide.BUY);
        ExecutionResult result = ExecutionResult.rejected("Price out of range");
        when(orderExecutor.execute(mockOrder, mockInstrument))
            .thenReturn(new ExecutionDecision(result, "DEFAULT"));

        assertDoesNotThrow(() -> executionService.processOrderPlaced(event));

        verify(settlementService, times(1)).settleOrder(
            eq(123L), eq(1L), any(), eq(100), eq(OrderSide.BUY), eq(result));
    }

    @Test
    @DisplayName("Non-terminal decision (pricing unavailable) does not settle")
    void testPricingUnavailableDoesNotSettle() {
        OrderPlacedEvent event = validEvent("123");
        when(orderMapper.findOrderById(123L)).thenReturn(Optional.of(mockOrder));
        when(instrumentMapper.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(mockInstrument));
        ExecutionResult result = ExecutionResult.pricingUnavailable("no quote");
        when(orderExecutor.execute(mockOrder, mockInstrument))
            .thenReturn(new ExecutionDecision(result, "DEFAULT"));

        assertDoesNotThrow(() -> executionService.processOrderPlaced(event));

        verify(settlementService, never()).settleOrder(
            any(), any(), any(), anyInt(), any(), any());
    }

    private OrderPlacedEvent validEvent(String orderId) {
        OrderPlacedEvent event = new OrderPlacedEvent();
        event.setOrderId(orderId);
        event.setAccountId(1L);
        event.setSymbol("AAPL");
        event.setSide("BUY");
        event.setQuantity(100);
        event.setPrice(new BigDecimal("150.00"));
        return event;
    }

    @SuppressWarnings("unused")
    private Instrument instrument(String symbol) {
        return new Instrument(1L, symbol, symbol + " Inc", AssetClass.EQUITY, "USD");
    }
}
