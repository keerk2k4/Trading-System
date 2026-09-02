package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.OrderType;

import java.math.BigDecimal;

public class OrderExecutor {

    private final MarketPriceProvider marketPriceProvider;
    private final PositionUpdater positionUpdater;

    public OrderExecutor(
            MarketPriceProvider marketPriceProvider,
            PositionUpdater positionUpdater
    ) {
        this.marketPriceProvider = marketPriceProvider;
        this.positionUpdater = positionUpdater;
    }

    public void execute(Order order) {

        BigDecimal executionPrice =
                determineExecutionPrice(order);

        positionUpdater.update(
                order,
                executionPrice
        );

        order.transitionTo(OrderStatus.FILLED);
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