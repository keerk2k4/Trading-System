package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.dto.PlaceOrderRequest;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.spring_boot_app.dto.CreateStrategyRequest;
import com.tradingsystem.spring_boot_app.dto.OrderResponse;
import com.tradingsystem.spring_boot_app.dto.StrategyPreferenceResponse;
import com.tradingsystem.spring_boot_app.exception.StrategyNotFoundException;
import com.tradingsystem.spring_boot_app.mapper.StrategyPreferenceMapper;
import com.tradingsystem.spring_boot_app.mapper.StrategyPreferenceMapper.StrategyPreferenceRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Owns customer quote-triggered MARKET-order strategies.
 */
@Service
public class StrategyService {

    private static final Logger LOGGER = LoggerFactory.getLogger(StrategyService.class);

    private final StrategyPreferenceMapper strategies;
    private final OrderService orders;

    public StrategyService(StrategyPreferenceMapper strategies, OrderService orders) {
        this.strategies = strategies;
        this.orders = orders;
    }

    public StrategyPreferenceResponse create(long accountId, CreateStrategyRequest request) {
        Long strategyId = strategies.nextStrategyId();
        strategies.insert(
                strategyId,
                accountId,
                request.getSymbol().trim().toUpperCase(),
                request.getSide().name(),
                request.getTargetPrice(),
                request.getQuantity());

        StrategyPreferenceRow row = strategies.findByIdAndAccountId(strategyId, accountId)
                .orElseThrow(() -> new StrategyNotFoundException(strategyId));
        return toResponse(row);
    }

    public List<StrategyPreferenceResponse> list(long accountId) {
        return strategies.findByAccountId(accountId).stream().map(this::toResponse).toList();
    }

    public void cancel(long accountId, long strategyId) {
        if (strategies.cancel(strategyId, accountId) == 0) {
            throw new StrategyNotFoundException(strategyId);
        }
    }

    /**
     * Called on every market-data quote update.
     */
    public void evaluateAgainstQuote(String symbol, QuoteTriggerPrice price) {
        String key = symbol == null ? "" : symbol.trim().toUpperCase();
        if (key.isBlank()) {
            return;
        }
        for (StrategyPreferenceRow row : strategies.findActiveBySymbol(key)) {
            tryTrigger(row, price);
        }
    }

    private void tryTrigger(StrategyPreferenceRow row, QuoteTriggerPrice price) {
        OrderSide side = OrderSide.valueOf(row.side());
        BigDecimal executable = executable(side, price);
        if (executable == null) {
            return;
        }

        if (!isMatch(side, executable, row.targetPrice())) {
            return;
        }

        // Claim first to prevent duplicate orders on rapid quote bursts.
        if (strategies.markTriggering(row.strategyId()) == 0) {
            return;
        }

        try {
            PlaceOrderRequest orderRequest = new PlaceOrderRequest(
                    row.accountId(),
                    OrderType.MARKET,
                    row.symbol(),
                    side,
                    row.quantity(),
                    null,
                    idempotencyKey(row.strategyId()));
            OrderResponse created = orders.placeOrder(orderRequest);
            strategies.markTriggered(row.strategyId(), created.orderId());
            LOGGER.info("Triggered strategy {} with order {}", row.strategyId(), created.orderId());
        } catch (RuntimeException ex) {
            strategies.markActive(row.strategyId());
            LOGGER.warn("Strategy {} matched but order placement failed; keeping ACTIVE", row.strategyId(), ex);
        }
    }

    private static String idempotencyKey(Long strategyId) {
        return "STRAT-" + strategyId + "-" + UUID.randomUUID();
    }

    private static boolean isMatch(OrderSide side, BigDecimal executable, BigDecimal target) {
        if (side == OrderSide.BUY) {
            return executable.compareTo(target) <= 0;
        }
        return executable.compareTo(target) >= 0;
    }

    private static BigDecimal executable(OrderSide side, QuoteTriggerPrice quote) {
        if (side == OrderSide.BUY) {
            return quote.ask() != null ? quote.ask() : quote.price();
        }
        return quote.bid() != null ? quote.bid() : quote.price();
    }

    private StrategyPreferenceResponse toResponse(StrategyPreferenceRow row) {
        return new StrategyPreferenceResponse(
                row.strategyId(),
                row.symbol(),
                OrderSide.valueOf(row.side()),
                row.targetPrice(),
                row.quantity(),
                row.status(),
                row.triggeredOrderId(),
                toOffset(row.createdAt()),
                toOffset(row.triggeredAt()));
    }

    private static OffsetDateTime toOffset(java.time.LocalDateTime value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }

    public record QuoteTriggerPrice(BigDecimal price, BigDecimal bid, BigDecimal ask) {
    }
}
