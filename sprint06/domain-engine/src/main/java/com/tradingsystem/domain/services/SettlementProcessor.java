package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Settlement;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.repositories.PositionRepository;
import com.tradingsystem.domain.repositories.SettlementRepository;

import java.math.BigDecimal;

public class SettlementProcessor {

    private final SettlementRepository settlementRepository;
    private final PositionRepository positionRepository;
    private final HoldingUpdater holdingUpdater;

    public SettlementProcessor(
            SettlementRepository settlementRepository,
            PositionRepository positionRepository,
            HoldingUpdater holdingUpdater
    ) {
        this.settlementRepository = settlementRepository;
        this.positionRepository = positionRepository;
        this.holdingUpdater = holdingUpdater;
    }

    public void settle(
            Order order,
            BigDecimal executionPrice
    ) {

        if (order.getProductType() != ProductType.DELIVERY) {
            return;
        }

        if (order.getSide() != OrderSide.BUY) {
            return;
        }

        Settlement settlement = new Settlement(
                generateSettlementId(),
                order.getAccount(),
                order.getInstrument(),
                order.getProductType(),
                order.getQuantity(),
                executionPrice
        );

        String accountId =
                order.getAccount()
                        .getAccountId()
                        .toString();

        settlementRepository.save(
                accountId,
                settlement
        );



        holdingUpdater.update(settlement);

        positionRepository.delete(
                accountId,
                order.getInstrument(),
                ProductType.DELIVERY
        );
    }

    private Long generateSettlementId() {
        return System.nanoTime();
    }
}