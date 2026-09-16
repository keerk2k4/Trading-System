
        package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.domain.repositories.impl.InMemoryHoldingRepository;
import com.tradingsystem.domain.repositories.impl.InMemoryPositionRepository;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InstrumentDelistedException;
import com.tradingsystem.exception.UserNotActiveException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderValidatorTest {

    @Test
    void shouldValidateLimitBuyWhenFundsAreAvailable() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        Order order = createOrder(
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.DELIVERY,
                2,
                new BigDecimal("3500.00")
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        OrderValidator validator = new OrderValidator(
                new InMemoryPositionRepository(),
                new InMemoryHoldingRepository(),
                marketPriceProvider
        );

        assertDoesNotThrow(() -> validator.validate(order));

        verifyNoInteractions(marketPriceProvider);
    }

    @Test
    void shouldRejectLimitBuyWhenFundsAreInsufficient() {

        Account account = createAccount(
                1L,
                new BigDecimal("5000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        Order order = createOrder(
                account,
                instrument,
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.DELIVERY,
                2,
                new BigDecimal("3500.00")
        );

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        OrderValidator validator = new OrderValidator(
                new InMemoryPositionRepository(),
                new InMemoryHoldingRepository(),
                marketPriceProvider
        );

        InsufficientFundsException exception =
                assertThrows(
                        InsufficientFundsException.class,
                        () -> validator.validate(order)
                );

        assertEquals(
                new BigDecimal("7000.00"),
                exception.getRequiredAmount()
        );

        assertEquals(
                new BigDecimal("5000.00"),
                exception.getAvailableAmount()
        );

        verifyNoInteractions(marketPriceProvider);
    }

    @Test
    void shouldValidateMarketBuyWhenFundsAreAvailable() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        when(marketPriceProvider.getMarketPrice(instrument))
                .thenReturn(new BigDecimal("3500.00"));

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.DELIVERY,
                2,
                null
        );

        OrderValidator validator = new OrderValidator(
                new InMemoryPositionRepository(),
                new InMemoryHoldingRepository(),
                marketPriceProvider
        );

        assertDoesNotThrow(() -> validator.validate(order));

        verify(marketPriceProvider)
                .getMarketPrice(instrument);
    }

    @Test
    void shouldRejectMarketBuyWhenFundsAreInsufficient() {

        Account account = createAccount(
                1L,
                new BigDecimal("5000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        MarketPriceProvider marketPriceProvider =
                mock(MarketPriceProvider.class);

        when(marketPriceProvider.getMarketPrice(instrument))
                .thenReturn(new BigDecimal("3500.00"));

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.DELIVERY,
                2,
                null
        );

        OrderValidator validator = new OrderValidator(
                new InMemoryPositionRepository(),
                new InMemoryHoldingRepository(),
                marketPriceProvider
        );

        InsufficientFundsException exception =
                assertThrows(
                        InsufficientFundsException.class,
                        () -> validator.validate(order)
                );

        assertEquals(
                new BigDecimal("7000.00"),
                exception.getRequiredAmount()
        );

        assertEquals(
                new BigDecimal("5000.00"),
                exception.getAvailableAmount()
        );
    }

    @Test
    void shouldRejectOrderWhenUserIsNotActive() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.BLOCKED,
                TradingStatus.ACTIVE
        );

        Order order = createOrder(
                account,
                createInstrument("TCS"),
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.DELIVERY,
                1,
                null
        );

        OrderValidator validator = createValidator();

        UserNotActiveException exception =
                assertThrows(
                        UserNotActiveException.class,
                        () -> validator.validate(order)
                );

        assertEquals(1L, exception.getUserId());
    }

    @Test
    void shouldRejectOrderWhenAccountIsNotActive() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.BLOCKED
        );

        Order order = createOrder(
                account,
                createInstrument("TCS"),
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.DELIVERY,
                1,
                null
        );

        OrderValidator validator = createValidator();

        AccountNotActiveException exception =
                assertThrows(
                        AccountNotActiveException.class,
                        () -> validator.validate(order)
                );

        assertEquals(1L, exception.getAccountId());
    }

    @Test
    void shouldRejectOrderWhenInstrumentIsDelisted() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");
        instrument.delist();

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.BUY,
                ProductType.DELIVERY,
                1,
                null
        );

        OrderValidator validator = createValidator();

        InstrumentDelistedException exception =
                assertThrows(
                        InstrumentDelistedException.class,
                        () -> validator.validate(order)
                );

        assertEquals("TCS", exception.getSymbol());
    }

    @Test
    void shouldValidateIntradaySellWhenPositionIsAvailable() {

        Account account = createAccount(
                1L,
                BigDecimal.ZERO,
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        Position position = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        InMemoryPositionRepository positionRepository =
                new InMemoryPositionRepository();

        positionRepository.save("1", position);

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5,
                null
        );

        OrderValidator validator = new OrderValidator(
                positionRepository,
                new InMemoryHoldingRepository(),
                mock(MarketPriceProvider.class)
        );

        assertDoesNotThrow(() -> validator.validate(order));
    }

    @Test
    void shouldRejectIntradaySellWhenPositionDoesNotExist() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Order order = createOrder(
                account,
                createInstrument("TCS"),
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5,
                null
        );

        OrderValidator validator = createValidator();

        InsufficientHoldingsException exception =
                assertThrows(
                        InsufficientHoldingsException.class,
                        () -> validator.validate(order)
                );

        assertEquals(5, exception.getRequiredQuantity());
        assertEquals(0, exception.getAvailableQuantity());
    }

    @Test
    void shouldRejectIntradaySellWhenPositionQuantityIsInsufficient() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        Position position = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                3,
                new BigDecimal("3500.00")
        );

        InMemoryPositionRepository positionRepository =
                new InMemoryPositionRepository();

        positionRepository.save("1", position);

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5,
                null
        );

        OrderValidator validator = new OrderValidator(
                positionRepository,
                new InMemoryHoldingRepository(),
                mock(MarketPriceProvider.class)
        );

        InsufficientHoldingsException exception =
                assertThrows(
                        InsufficientHoldingsException.class,
                        () -> validator.validate(order)
                );

        assertEquals(5, exception.getRequiredQuantity());
        assertEquals(3, exception.getAvailableQuantity());
    }

    @Test
    void shouldValidateDeliverySellWhenHoldingIsAvailable() {

        Account account = createAccount(
                1L,
                BigDecimal.ZERO,
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        Holding holding = new Holding(
                1L,
                account,
                instrument,
                10,
                new BigDecimal("3500.00")
        );

        InMemoryHoldingRepository holdingRepository =
                new InMemoryHoldingRepository();

        holdingRepository.save("1", holding);

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.DELIVERY,
                5,
                null
        );

        OrderValidator validator = new OrderValidator(
                new InMemoryPositionRepository(),
                holdingRepository,
                mock(MarketPriceProvider.class)
        );

        assertDoesNotThrow(() -> validator.validate(order));
    }

    @Test
    void shouldRejectDeliverySellWhenHoldingDoesNotExist() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Order order = createOrder(
                account,
                createInstrument("TCS"),
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.DELIVERY,
                5,
                null
        );

        OrderValidator validator = createValidator();

        InsufficientHoldingsException exception =
                assertThrows(
                        InsufficientHoldingsException.class,
                        () -> validator.validate(order)
                );

        assertEquals(5, exception.getRequiredQuantity());
        assertEquals(0, exception.getAvailableQuantity());
    }

    @Test
    void shouldRejectDeliverySellWhenHoldingQuantityIsInsufficient() {

        Account account = createAccount(
                1L,
                new BigDecimal("10000.00"),
                UserStatus.ACTIVE,
                TradingStatus.ACTIVE
        );

        Instrument instrument = createInstrument("TCS");

        Holding holding = new Holding(
                1L,
                account,
                instrument,
                3,
                new BigDecimal("3500.00")
        );

        InMemoryHoldingRepository holdingRepository =
                new InMemoryHoldingRepository();

        holdingRepository.save("1", holding);

        Order order = createOrder(
                account,
                instrument,
                OrderType.MARKET,
                OrderSide.SELL,
                ProductType.DELIVERY,
                5,
                null
        );

        OrderValidator validator = new OrderValidator(
                new InMemoryPositionRepository(),
                holdingRepository,
                mock(MarketPriceProvider.class)
        );

        InsufficientHoldingsException exception =
                assertThrows(
                        InsufficientHoldingsException.class,
                        () -> validator.validate(order)
                );

        assertEquals(5, exception.getRequiredQuantity());
        assertEquals(3, exception.getAvailableQuantity());
    }

    private OrderValidator createValidator() {
        return new OrderValidator(
                new InMemoryPositionRepository(),
                new InMemoryHoldingRepository(),
                mock(MarketPriceProvider.class)
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

    private Account createAccount(
            Long accountId,
            BigDecimal balance,
            UserStatus userStatus,
            TradingStatus tradingStatus
    ) {
        User user = new User(
                accountId,
                "John",
                "Doe",
                "john" + accountId + "@example.com",
                "9876543210",
                "hashed-password",
                userStatus
        );

        return new Account(
                accountId,
                "ACC" + accountId,
                user,
                balance,
                tradingStatus,
                1L
        );
    }

    private Instrument createInstrument(String symbol) {
        return new Instrument(
                symbol,
                symbol + " Limited",
                AssetClass.EQUITY,
                "INR"
        );
    }
}

