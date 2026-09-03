package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.repositories.PositionRepository;

import java.math.BigDecimal;
import java.util.Optional;

public class PositionUpdater {

    private final PositionRepository positionRepository;

    public PositionUpdater(PositionRepository positionRepository) {
        this.positionRepository = positionRepository;
    }

    public void update(Order order, BigDecimal executionPrice) {

        String accountId =
                order.getAccount()
                        .getAccountId()
                        .toString();

        Optional<Position> existingPosition =
                positionRepository.findByAccountIdAndInstrumentAndProductType(
                        accountId,
                        order.getInstrument(),
                        order.getProductType()
                );

        if (existingPosition.isPresent()) {
            updateExistingPosition(
                    existingPosition.get(),
                    order,
                    executionPrice
            );
            return;
        }

        if (order.getSide() == OrderSide.SELL) {
            throw new IllegalStateException(
                    "Cannot execute sell without an existing position"
            );
        }

        Position position = new Position(
                order.getAccount(),
                order.getInstrument(),
                order.getProductType(),
                0,
                executionPrice
        );

        position.buy(
                order.getQuantity(),
                executionPrice
        );

        positionRepository.save(accountId, position);
    }

    private void updateExistingPosition(
            Position position,
            Order order,
            BigDecimal executionPrice
    ) {
        if (order.getSide() == OrderSide.BUY) {
            position.buy(
                    order.getQuantity(),
                    executionPrice
            );
        } else {
            position.sell(order.getQuantity());
        }
    }
}