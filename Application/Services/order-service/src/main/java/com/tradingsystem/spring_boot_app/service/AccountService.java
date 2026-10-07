package com.tradingsystem.spring_boot_app.service;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.OrderStatus;
import com.tradingsystem.domain.enums.TradingStatus;
import com.tradingsystem.exception.OptimisticLockException;
import com.tradingsystem.spring_boot_app.dto.*;
import com.tradingsystem.spring_boot_app.mapper.AccountMapper;
import com.tradingsystem.spring_boot_app.mapper.HoldingMapper;
import com.tradingsystem.spring_boot_app.mapper.OrderMapper;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
public class AccountService {
    private final AccountMapper accounts;
    private final PositionMapper positions;
    private final OrderMapper orders;
    private final HoldingMapper holdings;
    private final LatestPriceCache prices;

    public AccountService(AccountMapper accounts, PositionMapper positions, OrderMapper orders,
                          HoldingMapper holdings, LatestPriceCache prices) {
        this.accounts = accounts;
        this.positions = positions;
        this.orders = orders;
        this.holdings = holdings;
        this.prices = prices != null ? prices : new LatestPriceCache();
    }

    public AccountResponse getAccount(long id) {
        Account account = account(id);
        String holderName = holderName(account.getHolder());
        return new AccountResponse(account.getAccountId(), account.getAccountReference(),
            holderName,
                account.getCashBalance(), status(account.getTradingStatus()),
                account.getLoadedVersion(), now());
    }

    public BalanceResponse getBalance(long id) {
        Account account = account(id);
        return new BalanceResponse(account.getAccountId(), account.getCashBalance(), "USD", now());
    }

    public BalanceResponse updateBalance(long id, java.math.BigDecimal cashBalance) {
        Account account = account(id);
        int updated = accounts.updateAvailableBalanceOptimistic(id, cashBalance, account.getLoadedVersion());
        if (updated == 0) {
            throw new OptimisticLockException(id);
        }
        return new BalanceResponse(id, cashBalance, "USD", now());
    }

    public List<PositionResponse> getPositions(long id) {
        account(id);
        return positions.findPositionsByAccountId(id).stream()
            .filter(p -> p.getQuantity() > 0 && !"CLOSED".equalsIgnoreCase(p.getPositionStatus()))
            .map(this::position).toList();
    }

    /**
     * Settled (demat) holdings. A filled DELIVERY buy lands in positions
     * first and is moved here after the settlement window, so this list only
     * ever shows settled shares. Enriched with the same live-price maths as
     * positions.
     */
    public List<HoldingResponse> getHoldings(long id) {
        account(id);
        return holdings.findHoldingsByAccountId(id).stream()
            .filter(h -> h.getQuantity() > 0)
            .map(this::holding).toList();
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

    private PositionResponse position(Position position) {        String symbol = position.getInstrument().getSymbol();
        java.math.BigDecimal currentPrice = prices.get(symbol)
                .map(com.tradingsystem.spring_boot_app.kafka.QuotePayload::price)
                .orElse(null);
        BigDecimal quantity = BigDecimal.valueOf(position.getQuantity());
        BigDecimal marketValue = currentPrice == null ? null : currentPrice.multiply(quantity);
        BigDecimal costBasis = position.getAveragePrice() == null ? null
                : position.getAveragePrice().multiply(quantity);
        BigDecimal unrealizedPnl = marketValue == null || costBasis == null ? null
                : marketValue.subtract(costBasis).setScale(2, RoundingMode.HALF_UP);
        BigDecimal unrealizedPnlPercent = unrealizedPnl == null || costBasis.signum() == 0 ? null
                : marketValue.subtract(costBasis).multiply(BigDecimal.valueOf(100))
                        .divide(costBasis, 2, RoundingMode.HALF_UP);
        return new PositionResponse(position.getAccount().getAccountId(),
                symbol, position.getQuantity(), position.getAveragePrice(),
                currentPrice, marketValue, unrealizedPnl, unrealizedPnlPercent);
    }

    private HoldingResponse holding(com.tradingsystem.domain.entities.Holding holding) {
        String symbol = holding.getInstrument().getSymbol();
        java.math.BigDecimal currentPrice = prices.get(symbol)
                .map(com.tradingsystem.spring_boot_app.kafka.QuotePayload::price)
                .orElse(null);
        BigDecimal quantity = BigDecimal.valueOf(holding.getQuantity());
        BigDecimal marketValue = currentPrice == null ? null : currentPrice.multiply(quantity);
        BigDecimal costBasis = holding.getAveragePrice() == null ? null
                : holding.getAveragePrice().multiply(quantity);
        BigDecimal unrealizedPnl = marketValue == null || costBasis == null ? null
                : marketValue.subtract(costBasis).setScale(2, RoundingMode.HALF_UP);
        BigDecimal unrealizedPnlPercent = unrealizedPnl == null || costBasis.signum() == 0 ? null
                : marketValue.subtract(costBasis).multiply(BigDecimal.valueOf(100))
                        .divide(costBasis, 2, RoundingMode.HALF_UP);
        return new HoldingResponse(holding.getAccount().getAccountId(),
                symbol, holding.getQuantity(), holding.getAveragePrice(),
                currentPrice, marketValue, unrealizedPnl, unrealizedPnlPercent);
    }

    private OrderHistoryEntry order(Order order) {
        return new OrderHistoryEntry("ORD-" + order.getOrderId(), order.getAccount().getAccountId(),
                order.getInstrument().getSymbol(), order.getSide(), order.getOrderType(), order.getQuantity(), order.getLimitPrice(),
                order.getLimitPrice(), order.getStatus(), order.getIdempotencyKey(), now(), null, null);
    }

    private OrderHistoryEntry orderEntry(OrderHistoryRow row) {
        return new OrderHistoryEntry(
                row.orderId(),
                row.accountId(),
                row.symbol(),
                row.side(),
                row.orderType(),
                row.quantity(),
                row.price(),
                row.executedPrice(),
                row.status(),
                row.idempotencyKey(),
                toOffsetUtc(row.createdOn()),
                row.realizedPnl(),
                row.realizedPnlPercent()
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

    private String holderName(User holder) {
        if (holder == null) {
            return "Unknown holder";
        }

        String firstName = holder.getFirstName() == null ? "" : holder.getFirstName().trim();
        String lastName = holder.getLastName() == null ? "" : holder.getLastName().trim();
        String fullName = (firstName + " " + lastName).trim();

        return fullName.isEmpty() ? "Unknown holder" : fullName;
    }
}
