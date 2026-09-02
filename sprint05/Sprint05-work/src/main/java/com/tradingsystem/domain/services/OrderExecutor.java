package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.repositories.IdempotencyStore;

import java.math.BigDecimal;

public class OrderExecutor {

    private final IdempotencyStore idempotencyStore;

    public OrderExecutor(IdempotencyStore idempotencyStore) {
        this.idempotencyStore = idempotencyStore;

    }

    public BigDecimal execute(Order order) {

        order.transitionTo(OrderStatus.OPEN);

        BigDecimal executionPrice = order.getLimitPrice();

        if (executionPrice == null) {
            throw new IllegalStateException(
                    "No execution price available"
            );
        }

        order.transitionTo(OrderStatus.FILLED);

        idempotencyStore.save(order.getIdempotencyKey());

        return executionPrice;
    }
}
