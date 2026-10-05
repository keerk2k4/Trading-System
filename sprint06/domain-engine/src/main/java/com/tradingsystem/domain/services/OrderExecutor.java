package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.repositories.IdempotencyStore;

import java.math.BigDecimal;

public class OrderExecutor {

    private final MarketPriceProvider marketPriceProvider;
    private final PositionUpdater positionUpdater;
    private final IdempotencyStore idempotencyStore;


    public OrderExecutor(
            MarketPriceProvider marketPriceProvider,
            PositionUpdater positionUpdater,IdempotencyStore idempotencyStore
    ) {
        this.marketPriceProvider = marketPriceProvider;
        this.positionUpdater = positionUpdater;
        this.idempotencyStore = idempotencyStore;
    }

    public void execute(Order order) {

        BigDecimal executionPrice =
                determineExecutionPrice(order);

        positionUpdater.update(
                order,
                executionPrice
        );

        order.transitionTo(OrderStatus.FILLED);

        idempotencyStore.save(order.getIdempotencyKey());


    }

    private BigDecimal determineExecutionPrice(Order order) {

        if (order.getOrderType() == OrderType.LIMIT) {
            return order.getLimitPrice();
        }

        if (order.getOrderType() == OrderType.MARKET) {
            return marketPriceProvider.getMarketPrice(
                    order.getInstrument()
            );
        }

        throw new IllegalArgumentException(
                "Unsupported order type"
        );

    }
}