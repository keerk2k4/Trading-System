package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.TradingStatus;

import java.math.BigDecimal;

public class OrderValidator {

    public void validate(Order order, Holding holding) {

        Account account = order.getAccount();

        if (account.getTradingStatus() != TradingStatus.ACTIVE) {
            throw new IllegalStateException(
                    "Account is not active"
            );
        }

        if (!order.getInstrument().mayBeTraded()) {
            throw new IllegalStateException(
                    "Instrument is not available for trading"
            );
        }

        if (order.getSide() == OrderSide.BUY) {
            validateBuy(order);
        } else {
            validateSell(order, holding);
        }
    }

    private void validateBuy(Order order) {

        if (order.getLimitPrice() == null) {
            // Market order: execution price is not known yet.
            return;
        }

        BigDecimal requiredAmount =
                order.getLimitPrice()
                        .multiply(BigDecimal.valueOf(order.getQuantity()));

        if (!order.getAccount().canAfford(requiredAmount)) {
            throw new IllegalStateException(
                    "Insufficient account balance"
            );
        }
    }

    private void validateSell(Order order, Holding holding) {

        if (holding == null) {
            throw new IllegalStateException(
                    "No holdings available to sell"
            );
        }

        if (holding.getQuantity() < order.getQuantity()) {
            throw new IllegalStateException(
                    "Insufficient holdings to sell"
            );
        }
    }
}
