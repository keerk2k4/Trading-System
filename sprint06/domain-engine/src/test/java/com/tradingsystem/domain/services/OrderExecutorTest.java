package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.domain.repositories.IdempotencyStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OrderExecutorTest {

    private MarketPriceProvider marketPriceProvider;
    private PositionUpdater positionUpdater;
    private IdempotencyStore idempotencyStore;
    private OrderExecutor executor;

    @BeforeEach
    void setUp() {
        marketPriceProvider = mock(MarketPriceProvider.class);
        positionUpdater = mock(PositionUpdater.class);
        idempotencyStore = mock(IdempotencyStore.class);

        executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater,
                idempotencyStore
        );
    }

    @Test
    void shouldExecuteLimitBuyUsingLimitPrice() {
        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00"),
                "Test-Key-001"
        );

        executor.execute(order);

        verify(positionUpdater).update(
                order,
                new BigDecimal("3500.00")
        );
        verifyNoInteractions(marketPriceProvider);
        verify(idempotencyStore).save(order.getIdempotencyKey());

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldExecuteMarketBuyUsingMarketPrice() {
        Account account = createAccount();
        Instrument instrument = createInstrument();

        when(marketPriceProvider.getMarketPrice(instrument))
                .thenReturn(new BigDecimal("3525.00"));

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                null,
                "Test-Key-001"
        );

        executor.execute(order);

        verify(marketPriceProvider).getMarketPrice(instrument);
        verify(positionUpdater).update(
                order,
                new BigDecimal("3525.00")
        );
        verify(idempotencyStore).save(order.getIdempotencyKey());

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldExecuteLimitSellUsingLimitPrice() {
        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5,
                new BigDecimal("3600.00"),
                "Test-Key-001"
        );

        executor.execute(order);

        verify(positionUpdater).update(
                order,
                new BigDecimal("3600.00")
        );
        verifyNoInteractions(marketPriceProvider);
        verify(idempotencyStore).save(order.getIdempotencyKey());

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldExecuteMarketSellUsingMarketPrice() {
        Account account = createAccount();
        Instrument instrument = createInstrument();

        when(marketPriceProvider.getMarketPrice(instrument))
                .thenReturn(new BigDecimal("3450.00"));

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5,
                null,
                "Test-Key-001"
        );

        executor.execute(order);

        verify(marketPriceProvider).getMarketPrice(instrument);
        verify(positionUpdater).update(
                order,
                new BigDecimal("3450.00")
        );
        verify(idempotencyStore).save(order.getIdempotencyKey());

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldMarkOrderAsFilledAfterSuccessfulExecution() {
        Order order = createOrder(
                createAccount(),
                createInstrument(),
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00"),
                "Test-Key-001"
        );

        executor.execute(order);

        assertEquals(OrderStatus.FILLED, order.getStatus());
        verify(idempotencyStore).save(order.getIdempotencyKey());
    }

    @Test
    void shouldSaveIdempotencyKeyAfterSuccessfulExecution() {
        Order order = createOrder(
                createAccount(),
                createInstrument(),
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00"),
                "Test-Key-001"
        );

        executor.execute(order);

        var orderedCalls = inOrder(positionUpdater, idempotencyStore);

        orderedCalls.verify(positionUpdater).update(
                order,
                new BigDecimal("3500.00")
        );
        orderedCalls.verify(idempotencyStore)
                .save(order.getIdempotencyKey());
    }

    @Test
    void shouldNotMarkOrderAsFilledWhenPositionUpdateFails() {
        Order order = createOrder(
                createAccount(),
                createInstrument(),
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00"),
                "Test-Key-001"
        );

        doThrow(new RuntimeException("Position update failed"))
                .when(positionUpdater)
                .update(order, new BigDecimal("3500.00"));

        assertThrows(
                RuntimeException.class,
                () -> executor.execute(order)
        );

        assertEquals(OrderStatus.NEW, order.getStatus());
        verify(idempotencyStore, never()).save(
                order.getIdempotencyKey()
        );
    }

    @Test
    void shouldRejectUnsupportedOrderType() {
        Order order = createOrder(
                createAccount(),
                createInstrument(),
                OrderType.STOP_LOSS,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                null,
                "Test-Key-001"
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> executor.execute(order)
        );

        verifyNoInteractions(positionUpdater);
        verifyNoInteractions(marketPriceProvider);
        verifyNoInteractions(idempotencyStore);

        assertEquals(OrderStatus.NEW, order.getStatus());
    }

    private Account createAccount() {
        User user = new User(
                1L,
                "John",
                "Doe",
                "john@example.com",
                "9876543210",
                "hashed-password",
                UserStatus.ACTIVE
        );

        return new Account(
                1L,
                "ACC1",
                user,
                new BigDecimal("10000.00"),
                TradingStatus.ACTIVE,
                1L
        );
    }

    private Instrument createInstrument() {
        return new Instrument(
                "TCS",
                "TCS Limited",
                AssetClass.EQUITY,
                "INR"
        );
    }

    private Order createOrder(
            Account account,
            Instrument instrument,
            OrderType orderType,
            OrderSide side,
            ProductType productType,
            int quantity,
            BigDecimal limitPrice,
            String idempotencyKey
    ) {
        return new Order(
                1L,
                account,
                instrument,
                orderType,
                side,
                productType,
                quantity,
                limitPrice,
                idempotencyKey
        );
    }
}
