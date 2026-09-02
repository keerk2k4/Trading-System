package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;

import java.math.BigDecimal;

public class PositionUpdater {

    public Position update(
            Order order,
            Position position,
            BigDecimal executionPrice
    ) {

        if (order.getSide() == OrderSide.BUY) {

            if (position == null) {
                return new Position(
                        order.getAccount(),
                        order.getInstrument(),
                        order.getProductType(),
                        order.getQuantity(),
                        executionPrice
                );
            }

            position.buy(
                    order.getQuantity(),
                    executionPrice
            );

            return position;
        }

        if (position == null) {
            throw new IllegalStateException(
                    "Cannot sell without a position"
            );
        }

        position.sell(order.getQuantity());

        return position;
    }
}
