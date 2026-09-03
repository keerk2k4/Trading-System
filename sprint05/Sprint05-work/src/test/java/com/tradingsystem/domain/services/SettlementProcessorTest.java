package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.entities.Settlement;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.domain.enums.UserStatus;
import com.tradingsystem.domain.repositories.PositionRepository;
import com.tradingsystem.domain.repositories.SettlementRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SettlementProcessorTest {

    @Test
    void shouldCreateSettlementForDeliveryBuy() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.DELIVERY,
                10
        );

        BigDecimal executionPrice =
                new BigDecimal("3500.00");

        processor.settle(
                order,
                executionPrice
        );

        verify(settlementRepository).save(
                eq("1"),
                any(Settlement.class)
        );

        verify(holdingUpdater).update(
                any(Settlement.class)
        );

        verify(positionRepository).delete(
                "1",
                instrument,
                ProductType.DELIVERY
        );
    }

    @Test
    void shouldCreateCompletedSettlementForDeliveryBuy() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.DELIVERY,
                10
        );

        processor.settle(
                order,
                new BigDecimal("3500.00")
        );

        verify(settlementRepository)
                .save(
                        eq("1"),
                        argThat(settlement ->
                                settlement.getStatus()
                                        == Settlement.SettlementStatus.COMPLETED
                        )
                );
    }

    @Test
    void shouldPassCorrectSettlementToHoldingUpdater() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.DELIVERY,
                15
        );

        BigDecimal executionPrice =
                new BigDecimal("3750.00");

        processor.settle(
                order,
                executionPrice
        );

        verify(holdingUpdater).update(
                argThat(settlement ->
                        settlement.getAccount() == account
                                && settlement.getInstrument() == instrument
                                && settlement.getProductType()
                                == ProductType.DELIVERY
                                && settlement.getQuantity() == 15
                                && settlement.getExecutionPrice()
                                .equals(executionPrice)
                                && settlement.getStatus()
                                == Settlement.SettlementStatus.COMPLETED
                )
        );
    }

    @Test
    void shouldDeleteDeliveryPositionAfterSettlement() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.DELIVERY,
                10
        );

        processor.settle(
                order,
                new BigDecimal("3500.00")
        );

        verify(positionRepository).delete(
                "1",
                instrument,
                ProductType.DELIVERY
        );
    }

    @Test
    void shouldIgnoreIntradayOrder() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.INTRADAY,
                10
        );

        processor.settle(
                order,
                new BigDecimal("3500.00")
        );

        verifyNoInteractions(settlementRepository);
        verifyNoInteractions(positionRepository);
        verifyNoInteractions(holdingUpdater);
    }

    @Test
    void shouldIgnoreDeliverySell() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount();
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.SELL,
                ProductType.DELIVERY,
                10
        );

        processor.settle(
                order,
                new BigDecimal("3500.00")
        );

        verifyNoInteractions(settlementRepository);
        verifyNoInteractions(positionRepository);
        verifyNoInteractions(holdingUpdater);
    }

    @Test
    void shouldSaveSettlementUnderCorrectAccount() {

        SettlementRepository settlementRepository =
                mock(SettlementRepository.class);

        PositionRepository positionRepository =
                mock(PositionRepository.class);

        HoldingUpdater holdingUpdater =
                mock(HoldingUpdater.class);

        SettlementProcessor processor =
                new SettlementProcessor(
                        settlementRepository,
                        positionRepository,
                        holdingUpdater
                );

        Account account = createAccount(25L);
        Instrument instrument = createInstrument();

        Order order = createOrder(
                account,
                instrument,
                OrderSide.BUY,
                ProductType.DELIVERY,
                10
        );

        processor.settle(
                order,
                new BigDecimal("3500.00")
        );

        verify(settlementRepository).save(
                eq("25"),
                any(Settlement.class)
        );

        verify(positionRepository).delete(
                "25",
                instrument,
                ProductType.DELIVERY
        );
    }

    private Account createAccount() {
        return createAccount(1L);
    }

    private Account createAccount(Long accountId) {

        User user = new User(
                accountId,
                "John",
                "Doe",
                "john" + accountId + "@example.com",
                "9876543210",
                "hashed-password",
                UserStatus.ACTIVE
        );

        return new Account(
                accountId,
                "ACC" + accountId,
                user,
                new BigDecimal("10000.00"),
                TradingStatus.ACTIVE,
                1L
        );
    }

    private Instrument createInstrument() {

        return new Instrument(
                "TCS",
                "TCS Limited",
                AssetClass.EQUITY,
                "INR"
        );
    }

    private Order createOrder(
            Account account,
            Instrument instrument,
            OrderSide side,
            ProductType productType,
            int quantity
    ) {

        return new Order(
                1L,
                account,
                instrument,
                OrderType.MARKET,
                side,
                productType,
                quantity,
                null
        );
    }
}