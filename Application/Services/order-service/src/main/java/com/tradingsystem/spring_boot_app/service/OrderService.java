package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.exception.InstrumentNotFoundException;
import com.tradingsystem.domain.repositories.HoldingRepository;
import com.tradingsystem.domain.repositories.IdempotencyStore;
import com.tradingsystem.domain.repositories.PositionRepository;
import com.tradingsystem.domain.services.OrderValidator;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.exception.OrderNotFoundException;
import com.tradingsystem.spring_boot_app.kafka.KafkaMessageEnvelope;
import com.tradingsystem.spring_boot_app.kafka.OrderPlacedPayload;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.InstrumentMapper;
import com.tradingsystem.spring_boot_app.mapper.HoldingMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import com.tradingsystem.spring_boot_app.kafka.TradeEventPublisher;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class OrderService {
    private final AccountMapper accounts;
    private final InstrumentMapper instruments;
    private final OrderMapper orders;
    private final PositionMapper positions;
    private final HoldingMapper holdingMapper;
    private final LatestPriceCache latestPriceCache;
    private final KafkaTemplate<String, KafkaMessageEnvelope<OrderPlacedPayload>> kafkaTemplate;
    private final TradeEventPublisher tradeEvents;

    public OrderService(AccountMapper accounts, InstrumentMapper instruments,
                        OrderMapper orders, PositionMapper positions, HoldingMapper holdingMapper,
                        LatestPriceCache latestPriceCache,
                        KafkaTemplate<String, KafkaMessageEnvelope<OrderPlacedPayload>> kafkaTemplate,
                        TradeEventPublisher tradeEvents) {
        this.accounts = accounts;
        this.instruments = instruments;
        this.orders = orders;
        this.positions = positions;
        this.holdingMapper = holdingMapper;
        this.latestPriceCache = latestPriceCache;
        this.kafkaTemplate = kafkaTemplate;
        this.tradeEvents = tradeEvents;
    }

    @Transactional
    public OrderResponse placeOrder(PlaceOrderRequest request) {

        Account account = accounts.findAccountById(request.getAccountId())
                .orElseThrow(() -> new AccountNotFoundException(request.getAccountId()));

        Instrument instrument = instruments.findInstrumentBySymbol(request.getSymbol())
                .orElseThrow(() -> new InstrumentNotFoundException(request.getSymbol()));

        Order order = new Order(orders.nextOrderId(), account, instrument, request.getOrderType(),
                request.getSide(), ProductType.DELIVERY, request.getQuantity(), request.getPrice(), null,
                request.getIdempotencyKey());

        OrderValidator validator = new OrderValidator(
                new DatabasePositionRepository(), new DatabaseHoldingRepository(),
            instrument1 -> resolveValidationPrice(request, instrument1),
                new DatabaseIdempotencyStore());
        validator.validate(order);

        orders.insertOrder(order);

        String key = String.valueOf(account.getAccountId());
        KafkaMessageEnvelope<OrderPlacedPayload> event = buildOrderPlacedEvent(order, account, instrument, request);

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                kafkaTemplate.send("orders", key, event);
            }
        });

        return new OrderResponse("ORD-" + order.getOrderId(), OrderStatus.NEW,
                "Order accepted, pending execution", instrument.getSymbol(), request.getSide(),
                request.getQuantity(), request.getPrice(), request.getOrderType());
    }

    private KafkaMessageEnvelope<OrderPlacedPayload> buildOrderPlacedEvent(
            Order order, Account account, Instrument instrument, PlaceOrderRequest request) {

        String nowIso = DateTimeFormatter.ISO_INSTANT.format(Instant.now());

        OrderPlacedPayload payload = new OrderPlacedPayload(
                String.valueOf(order.getOrderId()),
                account.getAccountId(),
                instrument.getSymbol(),
                request.getOrderType().name(),
                request.getSide().name(),
                request.getQuantity(),
                request.getPrice(),
                request.getIdempotencyKey(),
                nowIso
        );

        return new KafkaMessageEnvelope<>(
                UUID.randomUUID().toString(),
                "ORDER_PLACED",
                nowIso,
                "trade-api",
                1,
                payload
        );
    }

    private BigDecimal resolveValidationPrice(PlaceOrderRequest request, Instrument instrument) {
        if (!instrument.getSymbol().equals(request.getSymbol())) {
            return BigDecimal.ZERO;
        }

        if (request.getOrderType() == OrderType.MARKET) {
            QuotePayload quote = latestPriceCache.get(instrument.getSymbol()).orElseThrow(
                () -> new InvalidOrderArgumentException("Price", "No live quote available for MARKET order")
            );

            if (request.getSide() == com.tradingsystem.domain.enums.OrderSide.BUY && quote.ask() != null) {
                return quote.ask();
            }
            if (request.getSide() == com.tradingsystem.domain.enums.OrderSide.SELL && quote.bid() != null) {
                return quote.bid();
            }

            if (quote.price() != null) {
                return quote.price();
            }
            throw new InvalidOrderArgumentException("Price", "No executable quote price available for MARKET order");
        }

        return request.getPrice();
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
        Order cancelled = orders.findOrderById(numericId).orElse(order);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                tradeEvents.publishOrderCancelled(cancelled);
            }
        });
        return new OrderResponse("ORD-" + numericId, OrderStatus.CANCELLED, "Order cancelled",
                order.getInstrument().getSymbol(), order.getSide(), order.getQuantity(), order.getLimitPrice(),
                order.getOrderType());
    }

    /**
     * Update quantity and/or limit price of a working (NEW) order.
     *
     * <p>Guarded by {@code WHERE status = 'NEW'} so it races safely with the
     * Trade Executor, which prices LIMIT orders only after the 15s delay and
     * always re-reads this row. The new values are re-validated (funds for
     * BUY, holdings for SELL) before the write.
     */
    @Transactional
    public OrderResponse updateOrder(String id, Integer quantity, BigDecimal price) {
        long numericId;
        try {
            numericId = Long.parseLong(id);
        } catch (NumberFormatException ex) {
            throw new OrderNotFoundException(id);
        }
        Order order = orders.findOrderById(numericId).orElseThrow(() -> new OrderNotFoundException(id));
        if (order.getStatus() != OrderStatus.NEW) {
            throw new IllegalStateException("already terminal");
        }
        if (quantity == null && price == null) {
            throw new InvalidOrderArgumentException("Update", "empty");
        }
        if (price != null && order.getOrderType() == OrderType.MARKET) {
            throw new InvalidOrderArgumentException("Price", String.valueOf(price));
        }
        int newQuantity = quantity != null ? quantity : order.getQuantity();
        BigDecimal newPrice = price != null ? price : order.getLimitPrice();
        if (newQuantity < 1) {
            throw new InvalidOrderArgumentException("Quantity", String.valueOf(newQuantity));
        }
        if (order.getOrderType() == OrderType.LIMIT) {
            if (newPrice == null || newPrice.compareTo(new BigDecimal("0.01")) < 0
                    || newPrice.scale() > 2) {
                throw new InvalidOrderArgumentException("Price", String.valueOf(newPrice));
            }
        }

        // Re-validate funds / holdings against the new values.
        if (order.getSide() == com.tradingsystem.domain.enums.OrderSide.BUY) {
            BigDecimal checkPrice = order.getOrderType() == OrderType.MARKET
                    ? resolveValidationPrice(
                            new PlaceOrderRequest(order.getAccount().getAccountId(), OrderType.MARKET,
                                    order.getInstrument().getSymbol(), order.getSide(), newQuantity, null,
                                    order.getIdempotencyKey()),
                            order.getInstrument())
                    : newPrice;
            BigDecimal required = checkPrice.multiply(BigDecimal.valueOf(newQuantity));
            if (!order.getAccount().canAfford(required)) {
                throw new InsufficientFundsException(required, order.getAccount().getCashBalance());
            }
        } else {
            Optional<Holding> holding = holdingMapper.findHoldingByAccountAndInstrument(
                    order.getAccount().getAccountId(), order.getInstrument().getInstrumentId());
            int held = holding.map(Holding::getQuantity).orElse(0);
            if (held < newQuantity) {
                throw new InsufficientHoldingsException(newQuantity, held);
            }
        }

        if (orders.updateWorkingOrder(numericId, quantity, price) == 0) {
            throw new IllegalStateException("already terminal");
        }
        Order updated = orders.findOrderById(numericId).orElseThrow(() -> new OrderNotFoundException(id));
        return new OrderResponse("ORD-" + numericId, OrderStatus.NEW, "Order updated",
                updated.getInstrument().getSymbol(), updated.getSide(), updated.getQuantity(),
                updated.getLimitPrice(), updated.getOrderType());
    }

    public Optional<QuotePayload> latestQuote(String symbol) {
        if (symbol == null) {
            return Optional.empty();
        }
        return latestPriceCache.get(symbol);
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

    private class DatabaseHoldingRepository implements HoldingRepository {
        public void save(String accountId, Holding holding) { holdingMapper.insertHolding(holding); }
        public List<Holding> findByAccountId(String accountId) { return holdingMapper.findHoldingsByAccountId(Long.valueOf(accountId)); }
        public Optional<Holding> findByAccountIdAndInstrument(String accountId, Instrument instrument) {
            return holdingMapper.findHoldingByAccountAndInstrument(Long.valueOf(accountId), instrument.getInstrumentId());
        }
    }
}