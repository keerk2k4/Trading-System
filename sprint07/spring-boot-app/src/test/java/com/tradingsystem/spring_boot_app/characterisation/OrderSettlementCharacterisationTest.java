package com.tradingsystem.spring_boot_app.characterisation;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.DuplicateOrderException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InstrumentNotFoundException;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.kafka.KafkaMessageEnvelope;
import com.tradingsystem.spring_boot_app.kafka.OrderPlacedPayload;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.HoldingMapper;
import com.tradingsystem.spring_boot_app.mapper.InstrumentMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import com.tradingsystem.spring_boot_app.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderSettlementCharacterisationTest {

    private static final String KEY = "6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e";

    @Mock
    private AccountMapper accounts;
    @Mock
    private InstrumentMapper instruments;
    @Mock
    private OrderMapper orders;
    @Mock
    private PositionMapper positions;
    @Mock
    private HoldingMapper holdingMapper;

    private OrderService service;

    private Account activeAccount(BigDecimal cash) {
        User user = new User(9L, "Test", "User", "test@example.com", "123", "hash", UserStatus.ACTIVE);
        return new Account(1L, "ACC-001", user, cash, TradingStatus.ACTIVE, 0L);
    }

    private Instrument acme() {
        return new Instrument(2L, "ACME", "Acme Corp", AssetClass.EQUITY, "USD");
    }

    private PlaceOrderRequest buyTenAt2550() {
        return new PlaceOrderRequest(1L, "ACME", OrderSide.BUY, 10, new BigDecimal("25.50"), KEY);
    }

    @BeforeEach
    void setUp() {
        TransactionSynchronizationManager.initSynchronization();
        KafkaTemplate<String, KafkaMessageEnvelope<OrderPlacedPayload>> kafkaTemplate = Mockito.mock(KafkaTemplate.class);
        service = new OrderService(accounts, instruments, orders, positions, holdingMapper, kafkaTemplate);
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    @DisplayName("accepted BUY writes a NEW order row and answers pending")
    void acceptedBuyWritesOrderCashAndPosition() {
        Account account = activeAccount(new BigDecimal("10000.00"));
        Instrument instrument = acme();

        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account));
        when(instruments.findInstrumentBySymbol("ACME")).thenReturn(Optional.of(instrument));
        when(orders.nextOrderId()).thenReturn(7L);
        when(orders.existsByIdempotencyKey(KEY)).thenReturn(false);

        OrderResponse response = service.placeOrder(buyTenAt2550());

        // Sprint 7 accepts the order and defers execution to the trade executor.
        assertEquals("ORD-7", response.orderId());
        assertEquals(OrderStatus.NEW, response.status());
        assertEquals("Order accepted, pending execution", response.message());
        assertEquals("ACME", response.symbol());
        assertEquals(OrderSide.BUY, response.side());
        assertEquals(10, response.quantity());
        assertTrue(new BigDecimal("25.50").compareTo(response.price()) == 0);

        // The order row is inserted as NEW; execution and settlement happen asynchronously.
        ArgumentCaptor<Order> inserted = ArgumentCaptor.forClass(Order.class);
        verify(orders).insertOrder(inserted.capture());
        assertEquals(7L, inserted.getValue().getOrderId());
        assertEquals(10, inserted.getValue().getQuantity());
        assertTrue(new BigDecimal("25.50").compareTo(inserted.getValue().getLimitPrice()) == 0);
        assertEquals(KEY, inserted.getValue().getIdempotencyKey());
        verify(orders, never()).updateOrderStatus(anyLong(), any(OrderStatus.class));
        verify(accounts, never()).updateAvailableBalanceOptimistic(anyLong(), any(BigDecimal.class), anyLong());
        verify(positions, never()).insertPosition(any(Position.class));
    }

    @Test
    @DisplayName("reused idempotency key throws DuplicateOrderException and writes nothing")
    void reusedKeyWritesNothing() {
        Account account = activeAccount(new BigDecimal("10000.00"));
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account));
        when(instruments.findInstrumentBySymbol("ACME")).thenReturn(Optional.of(acme()));
        when(orders.nextOrderId()).thenReturn(7L);
        when(orders.existsByIdempotencyKey(KEY)).thenReturn(true);

        assertThrows(DuplicateOrderException.class, () -> service.placeOrder(buyTenAt2550()));

        verify(orders, never()).insertOrder(any(Order.class));
        verify(positions, never()).insertPosition(any(Position.class));
        verify(accounts, never()).updateAvailableBalanceOptimistic(anyLong(), any(BigDecimal.class), anyLong());
    }

    @Test
    @DisplayName("unaffordable BUY throws InsufficientFundsException and writes nothing")
    void unaffordableBuyWritesNothing() {
        Account account = activeAccount(new BigDecimal("10.00"));
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(account));
        when(instruments.findInstrumentBySymbol("ACME")).thenReturn(Optional.of(acme()));
        when(orders.nextOrderId()).thenReturn(7L);

        assertThrows(InsufficientFundsException.class, () -> service.placeOrder(buyTenAt2550()));

        verify(orders, never()).insertOrder(any(Order.class));
    }

    @Test
    @DisplayName("unknown symbol throws InstrumentNotFoundException")
    void unknownSymbolThrows() {
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(activeAccount(new BigDecimal("10000.00"))));
        when(instruments.findInstrumentBySymbol("NOPE")).thenReturn(Optional.empty());

        PlaceOrderRequest request =
                new PlaceOrderRequest(1L, "NOPE", OrderSide.BUY, 10, new BigDecimal("25.50"), KEY);

        assertThrows(InstrumentNotFoundException.class, () -> service.placeOrder(request));
        verify(orders, never()).insertOrder(any(Order.class));
        verify(instruments).findInstrumentBySymbol("NOPE");
    }

    @Test
    @DisplayName("account that is not ACTIVE throws AccountNotActiveException")
    void inactiveAccountThrows() {
        User user = new User(9L, "Test", "User", "test@example.com", "123", "hash", UserStatus.ACTIVE);
        Account suspended = new Account(1L, "ACC-001", user, new BigDecimal("10000.00"), TradingStatus.SUSPENDED, 0L);
        when(accounts.findAccountById(1L)).thenReturn(Optional.of(suspended));
        when(instruments.findInstrumentBySymbol("ACME")).thenReturn(Optional.of(acme()));
        when(orders.nextOrderId()).thenReturn(7L);

        assertThrows(AccountNotActiveException.class, () -> service.placeOrder(buyTenAt2550()));
        verify(orders, never()).insertOrder(any(Order.class));
    }
}
