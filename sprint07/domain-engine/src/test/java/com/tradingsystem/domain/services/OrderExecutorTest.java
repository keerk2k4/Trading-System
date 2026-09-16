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
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderExecutorTest {

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
                new BigDecimal("3500.00")
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        executor.execute(order);

        verify(positionUpdater).update(
                order,
                new BigDecimal("3500.00")
        );

        verifyNoInteractions(marketPriceProvider);

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldExecuteMarketBuyUsingMarketPrice() {

        Account account = createAccount();
        Instrument instrument = createInstrument();

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        when(marketPriceProvider.getMarketPrice(instrument))
                .thenReturn(new BigDecimal("3525.00"));

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                null
        );

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        executor.execute(order);

        verify(marketPriceProvider)
                .getMarketPrice(instrument);

        verify(positionUpdater).update(
                order,
                new BigDecimal("3525.00")
        );

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
                new BigDecimal("3600.00")
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        executor.execute(order);

        verify(positionUpdater).update(
                order,
                new BigDecimal("3600.00")
        );

        verifyNoInteractions(marketPriceProvider);

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldExecuteMarketSellUsingMarketPrice() {

        Account account = createAccount();
        Instrument instrument = createInstrument();

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        when(marketPriceProvider.getMarketPrice(instrument))
                .thenReturn(new BigDecimal("3450.00"));

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5,
                null
        );

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        executor.execute(order);

        verify(marketPriceProvider)
                .getMarketPrice(instrument);

        verify(positionUpdater).update(
                order,
                new BigDecimal("3450.00")
        );

        assertEquals(OrderStatus.FILLED, order.getStatus());
    }

    @Test
    void shouldMarkOrderAsFilledAfterSuccessfulExecution() {

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        executor.execute(order);

        assertEquals(
                OrderStatus.FILLED,
                order.getStatus()
        );
    }

    @Test
    void shouldNotMarkOrderAsFilledWhenPositionUpdateFails() {

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        doThrow(new RuntimeException("Position update failed"))
                .when(positionUpdater)
                .update(
                        order,
                        new BigDecimal("3500.00")
                );

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        assertThrows(
                RuntimeException.class,
                () -> executor.execute(order)
        );

        assertEquals(
                OrderStatus.NEW,
                order.getStatus()
        );
    }

    @Test
    void shouldRejectUnsupportedOrderType() {

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderType.STOP_LOSS,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10,
                null
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        PositionUpdater positionUpdater =
                mock(PositionUpdater.class);

        OrderExecutor executor = new OrderExecutor(
                marketPriceProvider,
                positionUpdater
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> executor.execute(order)
        );

        verifyNoInteractions(positionUpdater);
        verifyNoInteractions(marketPriceProvider);

        assertEquals(
                OrderStatus.NEW,
                order.getStatus()
        );
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
            BigDecimal limitPrice
    ) {

        return new Order(
                1L,
                account,
                instrument,
                orderType,
                side,
                productType,
                quantity,
                limitPrice
        );
    }
}