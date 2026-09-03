package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.*;
import com.tradingsystem.domain.repositories.IdempotencyStore;
import com.tradingsystem.domain.repositories.impl.IdempotencyStoreImpl;
import com.tradingsystem.domain.services.OrderValidator;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class OrderTest {

    @Test
    void shouldCreateOrderWithRequiredDetails() {

        Order order = createOrder();

        assertEquals(1L, order.getOrderId());
        assertEquals(OrderSide.BUY, order.getSide());
        assertEquals(OrderType.LIMIT, order.getOrderType());
        assertEquals(ProductType.DELIVERY, order.getProductType());
        assertEquals(10, order.getQuantity());

        assertEquals(
                new BigDecimal("100.00"),
                order.getLimitPrice()
        );
    }

    @Test
    void newOrderShouldHaveNewStatus() {

        Order order = createOrder();

        assertEquals(
                OrderStatus.NEW,
                order.getStatus()
        );
    }

    @Test
    void shouldMoveFromNewToOpen() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);

        assertEquals(
                OrderStatus.OPEN,
                order.getStatus()
        );
    }

    @Test
    void shouldMoveFromOpenToPartiallyFilled() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.PARTIALLY_FILLED);

        assertEquals(
                OrderStatus.PARTIALLY_FILLED,
                order.getStatus()
        );
    }

    @Test
    void shouldMoveFromPartiallyFilledToFilled() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.PARTIALLY_FILLED);
        order.transitionTo(OrderStatus.FILLED);

        assertEquals(
                OrderStatus.FILLED,
                order.getStatus()
        );
    }

    @Test
    void shouldAllowCancellationFromNew() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.CANCELLED);

        assertEquals(
                OrderStatus.CANCELLED,
                order.getStatus()
        );

        assertTrue(order.isTerminal());
    }

    @Test
    void shouldAllowRejectionFromNew() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.REJECTED);

        assertEquals(
                OrderStatus.REJECTED,
                order.getStatus()
        );

        assertTrue(order.isTerminal());
    }

    @Test
    void shouldAllowCancellationFromOpen() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.CANCELLED);

        assertEquals(
                OrderStatus.CANCELLED,
                order.getStatus()
        );

        assertTrue(order.isTerminal());
    }

    @Test
    void shouldAllowCancellationFromPartiallyFilled() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.PARTIALLY_FILLED);
        order.transitionTo(OrderStatus.CANCELLED);

        assertEquals(
                OrderStatus.CANCELLED,
                order.getStatus()
        );

        assertTrue(order.isTerminal());
    }

    @Test
    void shouldAllowExpirationFromOpen() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.EXPIRED);

        assertEquals(
                OrderStatus.EXPIRED,
                order.getStatus()
        );

        assertTrue(order.isTerminal());
    }

    @Test
    void shouldRejectInvalidTransitionFromNewToPartiallyFilled() {

        Order order = createOrder();

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(
                        OrderStatus.PARTIALLY_FILLED
                )
        );
    }

    @Test
    void shouldRejectInvalidTransitionFromNewToFilled() {

        Order order = createOrder();

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(
                        OrderStatus.FILLED
                )
        );
    }

    @Test
    void shouldRejectInvalidTransitionFromPartiallyFilledToOpen() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.PARTIALLY_FILLED);

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(OrderStatus.OPEN)
        );
    }

    @Test
    void shouldRejectInvalidTransitionAfterTerminalState() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.FILLED);

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(OrderStatus.OPEN)
        );
    }

    @Test
    void shouldRejectSecondTerminalState() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.CANCELLED);

        assertThrows(
                IllegalStateException.class,
                () -> order.transitionTo(OrderStatus.FILLED)
        );
    }

    @Test
    void shouldRejectTransitionToNull() {

        Order order = createOrder();

        assertThrows(
                IllegalArgumentException.class,
                () -> order.transitionTo(null)
        );
    }

    @Test
    void shouldIdentifyTerminalOrder() {

        Order order = createOrder();

        order.transitionTo(OrderStatus.OPEN);
        order.transitionTo(OrderStatus.FILLED);

        assertTrue(order.isTerminal());
    }

    @Test
    void shouldRejectZeroQuantity() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> createOrder(
                        0,
                        new BigDecimal("100.00")
                )
        );
    }

    @Test
    void shouldRejectNegativeQuantity() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> createOrder(
                        -5,
                        new BigDecimal("100.00")
                )
        );
    }

    @Test
    void shouldRejectNullAccount() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new Order(
                        1L,
                        null,
                        createInstrument(),
                        OrderType.LIMIT,
                        OrderSide.BUY,
                        ProductType.DELIVERY,
                        10,
                        new BigDecimal("100.00"),
                        "Test-Key-001"
                )
        );
    }

    @Test
    void shouldRejectNullInstrument() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new Order(
                        1L,
                        createAccount(),
                        null,
                        OrderType.LIMIT,
                        OrderSide.BUY,
                        ProductType.DELIVERY,
                        10,
                        new BigDecimal("100.00"),
                        "Test-Key-001"
                )
        );
    }

    @Test
    void shouldRejectLimitOrderWithoutLimitPrice() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> new Order(
                        1L,
                        createAccount(),
                        createInstrument(),
                        OrderType.LIMIT,
                        OrderSide.BUY,
                        ProductType.DELIVERY,
                        10,
                        null,
                        "Test-Key-001"
                )
        );
    }

    @Test
    void shouldRejectNegativeLimitPrice() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> createOrder(
                        10,
                        new BigDecimal("-100.00")
                )
        );
    }

    @Test
    void shouldRejectZeroLimitPrice() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> createOrder(
                        10,
                        BigDecimal.ZERO
                )
        );
    }

    @Test
    void shouldRejectLimitPriceWithMoreThanTwoDecimalPlaces() {

        assertThrows(
                InvalidOrderArgumentException.class,
                () -> createOrder(
                        10,
                        new BigDecimal("100.123")
                )
        );
    }

    @Test
    void limitPriceShouldRepresentCustomerSubmittedPrice() {

        Order order = createOrder();

        assertEquals(
                new BigDecimal("100.00"),
                order.getLimitPrice()
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
                "ACC-001",
                user,
                new BigDecimal("1000.00"),
                TradingStatus.ACTIVE,
                1L
        );
    }

    private Instrument createInstrument() {

        return new Instrument(
                "FAUX:TCS",
                "Tata Consultancy Services",
                AssetClass.EQUITY,
                "INR"
        );
    }

    private Order createOrder() {

        return createOrder(
                10,
                new BigDecimal("100.00")
        );
    }

    @Test
    void shouldAllowNewIdempotencyKey(){

        IdempotencyStore store = new IdempotencyStoreImpl();
        OrderValidator validator = new OrderValidator(store);
        Order order = createOrder();
        assertDoesNotThrow(()->validator.validate(order,null));
    }


    @Test

    void shouldStoreIdempotencyKey(){

        Order order = createOrder();
        assertEquals("Test-Key-001",order.getIdempotencyKey());
    }

    private Order createOrder(
            int quantity,
            BigDecimal limitPrice
    ) {

        return new Order(
                1L,
                createAccount(),
                createInstrument(),
                OrderType.LIMIT,
                OrderSide.BUY,
                ProductType.DELIVERY,
                quantity,
                limitPrice,
                "Test-Key-001"
        );
    }
}
