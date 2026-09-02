
        package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.domain.repositories.HoldingRepository;
import com.tradingsystem.domain.repositories.PositionRepository;
import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.InsufficientFundsException;
import com.tradingsystem.exception.InsufficientHoldingsException;
import com.tradingsystem.exception.InstrumentDelistedException;
import com.tradingsystem.exception.UserNotActiveException;

import java.math.BigDecimal;
import java.util.Optional;

public class OrderValidator {

    private final PositionRepository positionRepository;
    private final HoldingRepository holdingRepository;
    private final MarketPriceProvider marketPriceProvider;

    public OrderValidator(
            PositionRepository positionRepository,
            HoldingRepository holdingRepository,
            MarketPriceProvider marketPriceProvider
    ) {
        this.positionRepository = positionRepository;
        this.holdingRepository = holdingRepository;
        this.marketPriceProvider = marketPriceProvider;
    }

    public void validate(Order order) {
        validateUser(order);
        validateAccount(order);
        validateInstrument(order);
        validateFunds(order);
        validateSellAvailability(order);
    }

    private void validateUser(Order order) {

        UserStatus userStatus =
                order.getAccount()
                        .getHolder()
                        .getStatus();

        if (userStatus != UserStatus.ACTIVE) {
            throw new UserNotActiveException(
                    order.getAccount()
                            .getHolder()
                            .getUserId()
            );
        }
    }

    private void validateAccount(Order order) {

        TradingStatus tradingStatus =
                order.getAccount()
                        .getTradingStatus();

        if (tradingStatus != TradingStatus.ACTIVE) {
            throw new AccountNotActiveException(
                    order.getAccount().getAccountId()
            );
        }
    }

    private void validateInstrument(Order order) {

        if (!order.getInstrument().mayBeTraded()) {
            throw new InstrumentDelistedException(
                    order.getInstrument().getSymbol()
            );
        }
    }

    private void validateFunds(Order order) {

        if (order.getSide() != OrderSide.BUY) {
            return;
        }

        BigDecimal price;

        if (order.getOrderType() == OrderType.LIMIT) {
            price = order.getLimitPrice();
        } else if (order.getOrderType() == OrderType.MARKET) {
            price = marketPriceProvider.getMarketPrice(
                    order.getInstrument()
            );
        } else {
            return;
        }

        BigDecimal requiredFunds =
                price.multiply(
                        BigDecimal.valueOf(order.getQuantity())
                );

        if (!order.getAccount().canAfford(requiredFunds)) {
            throw new InsufficientFundsException(
                    requiredFunds,
                    order.getAccount().getCashBalance()
            );
        }
    }

    private void validateSellAvailability(Order order) {

        if (order.getSide() != OrderSide.SELL) {
            return;
        }

        if (order.getProductType() == ProductType.INTRADAY) {
            validateIntradayPosition(order);
            return;
        }

        if (order.getProductType() == ProductType.DELIVERY) {
            validateDeliveryHolding(order);
        }
    }

    private void validateIntradayPosition(Order order) {

        Optional<Position> position =
                positionRepository
                        .findByAccountIdAndInstrumentAndProductType(
                                order.getAccount()
                                        .getAccountId()
                                        .toString(),
                                order.getInstrument(),
                                ProductType.INTRADAY
                        );

        if (position.isEmpty()) {
            throw new InsufficientHoldingsException(
                    order.getQuantity(),
                    0
            );
        }

        int availableQuantity =
                position.get().getQuantity();

        if (availableQuantity < order.getQuantity()) {
            throw new InsufficientHoldingsException(
                    order.getQuantity(),
                    availableQuantity
            );
        }
    }

    private void validateDeliveryHolding(Order order) {

        Optional<Holding> holding =
                holdingRepository
                        .findByAccountIdAndInstrument(
                                order.getAccount()
                                        .getAccountId()
                                        .toString(),
                                order.getInstrument()
                        );

        if (holding.isEmpty()) {
            throw new InsufficientHoldingsException(
                    order.getQuantity(),
                    0
            );
        }

        int availableQuantity =
                holding.get().getQuantity();

        if (availableQuantity < order.getQuantity()) {
            throw new InsufficientHoldingsException(
                    order.getQuantity(),
                    availableQuantity
            );
        }
    }
}

