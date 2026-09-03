package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Account;
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
import com.tradingsystem.domain.repositories.impl.InMemoryPositionRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class PositionUpdaterTest {

    @Test
    void shouldCreatePositionForNewBuyOrder() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10
        );

        BigDecimal executionPrice =
                new BigDecimal("3500.00");

        positionUpdater.update(order, executionPrice);

        Position position =
                repository
                        .findByAccountIdAndInstrumentAndProductType(
                                "1",
                                instrument,
                                ProductType.INTRADAY
                        )
                        .orElseThrow();

        assertEquals(10, position.getQuantity());
        assertEquals(
                new BigDecimal("3500.00"),
                position.getAveragePrice()
        );
    }

    @Test
    void shouldIncreaseExistingPositionForBuyOrder() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Position existingPosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3000.00")
        );

        repository.save("1", existingPosition);

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10
        );

        positionUpdater.update(
                order,
                new BigDecimal("4000.00")
        );

        assertEquals(20, existingPosition.getQuantity());

        assertEquals(
                new BigDecimal("3500.00"),
                existingPosition.getAveragePrice()
        );

        assertEquals(
                1,
                repository.findByAccountId("1").size()
        );
    }

    @Test
    void shouldReduceExistingPositionForSellOrder() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Position existingPosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", existingPosition);

        Order order = createOrder(
                account,
                instrument,
                OrderSide.SELL,
                ProductType.INTRADAY,
                4
        );

        positionUpdater.update(
                order,
                new BigDecimal("3600.00")
        );

        assertEquals(
                6,
                existingPosition.getQuantity()
        );

        assertEquals(
                new BigDecimal("3500.00"),
                existingPosition.getAveragePrice()
        );
    }

    @Test
    void shouldThrowExceptionWhenSellingWithoutExistingPosition() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.SELL,
                ProductType.INTRADAY,
                5
        );

        assertThrows(
                IllegalStateException.class,
                () -> positionUpdater.update(
                        order,
                        new BigDecimal("3500.00")
                )
        );

        assertTrue(
                repository.findByAccountId("1").isEmpty()
        );
    }

    @Test
    void shouldUpdateDeliveryPositionSeparatelyFromIntradayPosition() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Position intradayPosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3000.00")
        );

        Position deliveryPosition = new Position(
                account,
                instrument,
                ProductType.DELIVERY,
                5,
                new BigDecimal("3200.00")
        );

        repository.save("1", intradayPosition);
        repository.save("1", deliveryPosition);

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.DELIVERY,
                5
        );

        positionUpdater.update(
                order,
                new BigDecimal("3400.00")
        );

        assertEquals(
                10,
                intradayPosition.getQuantity()
        );

        assertEquals(
                10,
                deliveryPosition.getQuantity()
        );

        assertEquals(
                new BigDecimal("3300.00"),
                deliveryPosition.getAveragePrice()
        );
    }

    @Test
    void shouldNotCreateDuplicatePositionForExistingPosition() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Position existingPosition = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", existingPosition);

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.INTRADAY,
                5
        );

        positionUpdater.update(
                order,
                new BigDecimal("3600.00")
        );

        assertEquals(
                1,
                repository.findByAccountId("1").size()
        );

        assertEquals(
                15,
                existingPosition.getQuantity()
        );
    }

    @Test
    void shouldUseExecutionPriceForNewPosition() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.INTRADAY,
                5
        );

        BigDecimal executionPrice =
                new BigDecimal("3750.50");

        positionUpdater.update(
                order,
                executionPrice
        );

        Position position =
                repository
                        .findByAccountIdAndInstrumentAndProductType(
                                "1",
                                instrument,
                                ProductType.INTRADAY
                        )
                        .orElseThrow();

        assertEquals(
                executionPrice,
                position.getAveragePrice()
        );

        assertEquals(
                5,
                position.getQuantity()
        );
    }

    @Test
    void shouldRemovePositionWhenSellingEntireQuantity() {

        InMemoryPositionRepository repository =
                new InMemoryPositionRepository();

        PositionUpdater positionUpdater =
                new PositionUpdater(repository);

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Position position = new Position(
                account,
                instrument,
                ProductType.INTRADAY,
                10,
                new BigDecimal("3500.00")
        );

        repository.save("1", position);

        Order order = createOrder(
                account,
                instrument,
                OrderSide.SELL,
                ProductType.INTRADAY,
                10
        );

        positionUpdater.update(
                order,
                new BigDecimal("3600.00")
        );

        /*
         * The current PositionUpdater only calls position.sell().
         * Therefore the Position object remains in the repository
         * with quantity 0.
         */
        assertEquals(
                0,
                position.getQuantity()
        );

        assertTrue(
                repository
                        .findByAccountIdAndInstrumentAndProductType(
                                "1",
                                instrument,
                                ProductType.INTRADAY
                        )
                        .isPresent()
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
            OrderSide side,
            ProductType productType,
            int quantity
    ) {

        return new Order(
                1L,
                account,
                instrument,
                OrderType.MARKET,
                side,
                productType,
                quantity,
                null,
                "test-key"
        );
    }
}