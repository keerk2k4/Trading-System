package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.spring_boot_app.dto.*;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
public class AccountService {
    private final AccountMapper accounts;
    private final PositionMapper positions;
    private final OrderMapper orders;

    public AccountService(AccountMapper accounts, PositionMapper positions, OrderMapper orders) {
        this.accounts = accounts;
        this.positions = positions;
        this.orders = orders;
    }

    public AccountResponse getAccount(long id) {
        Account account = account(id);
        return new AccountResponse(account.getAccountId(), account.getAccountReference(),
                account.getHolder().getFirstName() + " " + account.getHolder().getLastName(),
                account.getCashBalance(), status(account.getTradingStatus()),
                account.getLoadedVersion(), now());
    }

    public BalanceResponse getBalance(long id) {
        Account account = account(id);
        return new BalanceResponse(account.getAccountId(), account.getCashBalance(), "USD", now());
    }

    public List<PositionResponse> getPositions(long id) {
        account(id);
        return positions.findPositionsByAccountId(id).stream().map(this::position).toList();
    }

    public List<OrderHistoryEntry> getOrders(long id, OrderStatus status,
                                              java.time.OffsetDateTime from,
                                              java.time.OffsetDateTime to) {
        account(id);
        return orders.findOrderHistoryByAccountId(id).stream()
            .filter(order -> status == null || order.status() == status)
            .map(this::orderEntry).toList();
    }

    private Account account(long id) {
        return accounts.findAccountById(id).orElseThrow(() ->
                new com.tradingsystem.exception.AccountNotFoundException(id));
    }

    private PositionResponse position(Position position) {
        return new PositionResponse(position.getAccount().getAccountId(),
                position.getInstrument().getSymbol(), position.getQuantity(), position.getAveragePrice());
    }

    private OrderHistoryEntry order(Order order) {
        return new OrderHistoryEntry("ORD-" + order.getOrderId(), order.getAccount().getAccountId(),
                order.getInstrument().getSymbol(), order.getSide(), order.getQuantity(), order.getLimitPrice(),
                order.getLimitPrice(), order.getStatus(), order.getIdempotencyKey(), now());
    }

    private OrderHistoryEntry orderEntry(OrderHistoryRow row) {
        return new OrderHistoryEntry(
                row.orderId(),
                row.accountId(),
                row.symbol(),
                row.side(),
                row.quantity(),
                row.price(),
                row.executedPrice(),
                row.status(),
                row.idempotencyKey(),
                toOffsetUtc(row.createdOn())
        );
    }

    private OffsetDateTime toOffsetUtc(LocalDateTime value) {
        return value == null ? now() : value.atOffset(ZoneOffset.UTC);
    }

    private AccountStatus status(TradingStatus status) {
        return AccountStatus.valueOf(status.name());
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(ZoneOffset.UTC);
    }
}
