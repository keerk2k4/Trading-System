package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.DuplicateOrderException;
import com.tradingsystem.exception.InstrumentDelistedException;
import com.tradingsystem.exception.InstrumentNotFoundException;
import com.tradingsystem.exception.OptimisticLockException;
import com.tradingsystem.domain.repositories.HoldingRepository;
import com.tradingsystem.domain.repositories.IdempotencyStore;
import com.tradingsystem.domain.repositories.PositionRepository;
import com.tradingsystem.domain.services.OrderExecutor;
import com.tradingsystem.domain.services.OrderValidator;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.exception.OrderNotFoundException;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.InstrumentMapper;
import com.tradingsystem.spring_boot_app.mapper.HoldingMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Service
public class OrderService {
    private final AccountMapper accounts;
    private final InstrumentMapper instruments;
    private final OrderMapper orders;
    private final PositionMapper positions;
    private final HoldingMapper holdingMapper;

    public OrderService(AccountMapper accounts, InstrumentMapper instruments,
                        OrderMapper orders, PositionMapper positions, HoldingMapper holdingMapper) {
        this.accounts = accounts;
        this.instruments = instruments;
        this.orders = orders;
        this.positions = positions;
        this.holdingMapper = holdingMapper;
    }

    @Transactional
    public OrderResponse placeOrder(PlaceOrderRequest request) {
        Account account = accounts.findAccountById(request.getAccountId()).orElseThrow(() ->
                new AccountNotFoundException(request.getAccountId()));
        Instrument instrument = instruments.findInstrumentBySymbol(request.getSymbol()).orElseThrow(() ->
                new InstrumentNotFoundException(request.getSymbol()));

        Order order = new Order(orders.nextOrderId(), account, instrument, OrderType.LIMIT,
                request.getSide(), ProductType.DELIVERY, request.getQuantity(), request.getPrice(), null,
                request.getIdempotencyKey());

        OrderValidator validator = new OrderValidator(
                new DatabasePositionRepository(), new DatabaseHoldingRepository(),
                instrument1 -> instrument1.getSymbol().equals(instrument.getSymbol())
                        ? request.getPrice() : BigDecimal.ZERO,
                new DatabaseIdempotencyStore());
        validator.validate(order);

        if (request.getSide() == OrderSide.BUY) {
            account.debit(request.getPrice().multiply(BigDecimal.valueOf(request.getQuantity())));
            if (accounts.updateAvailableBalanceOptimistic(account.getAccountId(),
                    account.getCashBalance(), account.getLoadedVersion()) == 0) {
                throw new OptimisticLockException(account.getAccountId());
            }
        }

        orders.insertOrder(order);
        if (request.getSide() == OrderSide.BUY) {
            new OrderExecutor(instrument1 -> instrument1.getSymbol().equals(instrument.getSymbol())
                    ? request.getPrice() : BigDecimal.ZERO,
                    new DatabasePositionUpdater(), new DatabaseIdempotencyStore()).execute(order);
        } else {
            Holding holding = new DatabaseHoldingRepository()
                    .findByAccountIdAndInstrument(request.getAccountId().toString(), instrument).orElseThrow();
            holding.sell(request.getQuantity());
            holdingMapper.updateHolding(holding.getHoldingId(), holding.getQuantity(), holding.getAveragePrice());
            order.transitionTo(OrderStatus.FILLED);
        }
        orders.updateOrderStatus(order.getOrderId(), order.getStatus());
        return new OrderResponse("ORD-" + order.getOrderId(), OrderStatus.FILLED,
                "Order executed", instrument.getSymbol(), request.getSide(), request.getQuantity(), request.getPrice());
    }

    @Transactional
    public OrderResponse cancelOrder(String id) {
        long numericId;
        try {
            numericId = Long.parseLong(id);
        } catch (NumberFormatException ex) {
            throw new OrderNotFoundException(id);
        }
        Order order = orders.findOrderById(numericId).orElseThrow(() -> new OrderNotFoundException(id));
        if (orders.updateOrderStatusIfCurrent(numericId, OrderStatus.NEW, OrderStatus.CANCELLED) == 0) {
            throw new IllegalStateException("already terminal");
        }
        return new OrderResponse("ORD-" + numericId, OrderStatus.CANCELLED, "Order cancelled",
                order.getInstrument().getSymbol(), order.getSide(), order.getQuantity(), order.getLimitPrice());
    }

    private class DatabaseIdempotencyStore implements IdempotencyStore {
        public boolean exists(String key) { return orders.existsByIdempotencyKey(key); }
        public void save(String key) { }
    }

    private class DatabasePositionRepository implements PositionRepository {
        public void save(String accountId, Position position) {
            Optional<Position> current = findByAccountIdAndInstrumentAndProductType(accountId,
                    position.getInstrument(), position.getProductType());
            if (current.isPresent()) {
                positions.updatePosition(current.get().getPositionId(), position.getQuantity(), position.getAveragePrice());
            } else {
                Position persisted = new Position(positions.nextPositionId(), position.getAccount(),
                        position.getInstrument(), position.getProductType(), position.getQuantity(),
                        position.getAveragePrice(), position.getRealizedPnl(), position.getPositionStatus(),
                        position.getOpenedAt(), position.getClosedAt(), position.getUpdatedAt());
                positions.insertPosition(persisted);
            }
        }
        public List<Position> findByAccountId(String accountId) { return positions.findPositionsByAccountId(Long.valueOf(accountId)); }
        public Optional<Position> findByAccountIdAndInstrumentAndProductType(String accountId, Instrument instrument, ProductType productType) {
            return findByAccountId(accountId).stream().filter(p -> p.getInstrument().getInstrumentId().equals(instrument.getInstrumentId()) && p.getProductType() == productType).findFirst();
        }
        public void delete(String accountId, Instrument instrument, ProductType productType) { }
    }

    private class DatabasePositionUpdater extends com.tradingsystem.domain.services.PositionUpdater {
        DatabasePositionUpdater() { super(new DatabasePositionRepository()); }
    }

    private class DatabaseHoldingRepository implements HoldingRepository {
        public void save(String accountId, Holding holding) { holdingMapper.insertHolding(holding); }
        public List<Holding> findByAccountId(String accountId) { return holdingMapper.findHoldingsByAccountId(Long.valueOf(accountId)); }
        public Optional<Holding> findByAccountIdAndInstrument(String accountId, Instrument instrument) {
            return holdingMapper.findHoldingByAccountAndInstrument(Long.valueOf(accountId), instrument.getInstrumentId());
        }
    }
}
