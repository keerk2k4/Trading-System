package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Settlement;
import com.tradingsystem.domain.repositories.HoldingRepository;

import java.math.BigDecimal;
import java.util.Optional;

public class HoldingUpdater {

    private final HoldingRepository holdingRepository;

    public HoldingUpdater(HoldingRepository holdingRepository) {
        this.holdingRepository = holdingRepository;
    }

    public void update(Settlement settlement) {

        String accountId =
                settlement.getAccount()
                        .getAccountId()
                        .toString();

        Optional<Holding> existingHolding =
                holdingRepository.findByAccountIdAndInstrument(
                        accountId,
                        settlement.getInstrument()
                );

        if (existingHolding.isPresent()) {
            existingHolding.get().buy(
                    settlement.getQuantity(),
                    settlement.getExecutionPrice()
            );
            return;
        }

        Holding holding = new Holding(
                generateHoldingId(),
                settlement.getAccount(),
                settlement.getInstrument(),
                settlement.getQuantity(),
                settlement.getExecutionPrice()
        );

        holdingRepository.save(accountId, holding);
    }

    private Long generateHoldingId() {
        return System.nanoTime();
    }
}