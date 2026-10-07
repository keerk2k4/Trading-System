package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.dto.BalanceResponse;
import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import com.tradingsystem.spring_boot_app.mapper.PositionMapper;
import com.tradingsystem.spring_boot_app.portfolio.dto.PnlResponse;
import com.tradingsystem.spring_boot_app.portfolio.dto.PortfolioSummary;
import com.tradingsystem.spring_boot_app.portfolio.dto.PricedPosition;
import com.tradingsystem.spring_boot_app.portfolio.dto.RealisedPnlRow;
import com.tradingsystem.spring_boot_app.portfolio.dto.SymbolPnl;
import com.tradingsystem.spring_boot_app.service.AccountService;
import com.tradingsystem.spring_boot_app.service.LatestPriceCache;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * Prices an account's holdings and computes its profit and loss, as defined
 * in contracts/portfolio-api.yaml. Read-only: it reads positions and booked
 * realised P&L, takes cash from {@link AccountService}, and never writes.
 *
 * <p>Prices come from {@link LatestPriceCache}, which the market-data topic
 * keeps current. The executor's poller already quotes every held symbol in
 * batches, so this module spends no Fauxnance quota of its own. A quote is
 * stale when Fauxnance marked it so, or when it has not been refreshed within
 * {@code portfolio.price.max-age}. A stale quote is still served, marked.
 *
 * <p>Totals are in {@code portfolio.base-currency}. No FX conversion is done:
 * a holding quoted in another currency is shown with its own price, but left
 * out of the totals, and the summary is marked partial.
 */
@Service
public class PortfolioService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final PositionMapper positions;
    private final PortfolioMapper portfolio;
    private final AccountService accounts;
    private final LatestPriceCache prices;
    private final Duration maxPriceAge;
    private final String baseCurrency;
    private final Clock clock;

    @Autowired
    public PortfolioService(PositionMapper positions, PortfolioMapper portfolio, AccountService accounts,
                            LatestPriceCache prices,
                            @Value("${portfolio.price.max-age:PT5M}") Duration maxPriceAge,
                            @Value("${portfolio.base-currency:USD}") String baseCurrency) {
        this(positions, portfolio, accounts, prices, maxPriceAge, baseCurrency, Clock.systemUTC());
    }

    PortfolioService(PositionMapper positions, PortfolioMapper portfolio, AccountService accounts,
                     LatestPriceCache prices, Duration maxPriceAge, String baseCurrency, Clock clock) {
        this.positions = positions;
        this.portfolio = portfolio;
        this.accounts = accounts;
        this.prices = prices;
        this.maxPriceAge = maxPriceAge;
        this.baseCurrency = baseCurrency;
        this.clock = clock;
    }

    public PortfolioSummary summary(long accountId) {
        BalanceResponse balance = accounts.getBalance(accountId);
        List<PricedPosition> holdings = requirePricing(accountId, priced(accountId, null));

        List<PricedPosition> counted = holdings.stream().filter(this::countsInTotals).toList();
        BigDecimal marketValue = money(sum(counted.stream().map(PricedPosition::marketValue).toList()));
        BigDecimal costBasis = money(sum(counted.stream().map(PricedPosition::costBasis).toList()));
        BigDecimal unrealised = money(marketValue.subtract(costBasis));
        BigDecimal realised = money(sum(portfolio.realisedPnlBySymbol(accountId, null, null).stream()
                .map(RealisedPnlRow::realisedPnl).toList()));
        BigDecimal cash = money(balance.cashBalance());

        return new PortfolioSummary(accountId, baseCurrency, cash, marketValue, costBasis,
                unrealised, percent(unrealised, costBasis), realised, money(cash.add(marketValue)),
                holdings.size(), counted.size() < holdings.size(), now());
    }

    public List<PricedPosition> positions(long accountId, String symbol) {
        accounts.getBalance(accountId);
        return requirePricing(accountId, priced(accountId, symbol));
    }

    public PnlResponse pnl(long accountId, LocalDate from, LocalDate to, boolean bySymbol) {
        if (from != null && to != null && from.isAfter(to)) {
            // VAL-422: the platform's invalid-input code.
            throw new InvalidOrderArgumentException("from", from.toString());
        }
        accounts.getBalance(accountId);
        List<PricedPosition> holdings = requirePricing(accountId, priced(accountId, null));
        List<RealisedPnlRow> booked = portfolio.realisedPnlBySymbol(accountId, from, to);

        // Per symbol: realised from the booked sells in range, unrealised as at now.
        // A holding that cannot be priced in the base currency contributes no unrealised figure.
        Map<String, BigDecimal[]> rows = new TreeMap<>();
        for (RealisedPnlRow row : booked) {
            rows.computeIfAbsent(row.symbol(), s -> zeros())[0] = money(row.realisedPnl());
        }
        for (PricedPosition holding : holdings) {
            BigDecimal unrealised = countsInTotals(holding) ? holding.unrealisedPnl() : BigDecimal.ZERO;
            BigDecimal[] row = rows.computeIfAbsent(holding.symbol(), s -> zeros());
            row[1] = money(row[1].add(unrealised));
        }

        BigDecimal realised = money(sum(rows.values().stream().map(r -> r[0]).toList()));
        BigDecimal unrealised = money(sum(rows.values().stream().map(r -> r[1]).toList()));
        List<SymbolPnl> breakdown = !bySymbol ? null : rows.entrySet().stream()
                .map(e -> new SymbolPnl(e.getKey(), e.getValue()[0], e.getValue()[1],
                        money(e.getValue()[0].add(e.getValue()[1]))))
                .toList();

        return new PnlResponse(accountId, baseCurrency, from, to, realised, unrealised,
                money(realised.add(unrealised)), breakdown, now());
    }

    /** Open holdings, optionally one symbol, each priced from the latest quote. */
    private List<PricedPosition> priced(long accountId, String symbol) {
        return positions.findPositionsByAccountId(accountId).stream()
                .filter(p -> p.getQuantity() > 0 && !"CLOSED".equalsIgnoreCase(p.getPositionStatus()))
                .filter(p -> symbol == null || symbol.isBlank()
                        || p.getInstrument().getSymbol().equalsIgnoreCase(symbol.trim()))
                .map(p -> price(accountId, p))
                .toList();
    }

    private PricedPosition price(long accountId, Position position) {
        String symbol = position.getInstrument().getSymbol();
        String currency = Optional.ofNullable(position.getInstrument().getQuotationCurrency()).orElse(baseCurrency);
        BigDecimal quantity = BigDecimal.valueOf(position.getQuantity());
        BigDecimal averageCost = position.getAveragePrice() == null ? BigDecimal.ZERO : position.getAveragePrice();
        BigDecimal costBasis = money(averageCost.multiply(quantity));

        Optional<QuotePayload> quote = prices.get(symbol).filter(q -> q.price() != null);
        if (quote.isEmpty()) {
            return new PricedPosition(accountId, symbol, position.getQuantity(), averageCost, costBasis,
                    null, null, null, null, currency, null, true);
        }

        BigDecimal lastPrice = quote.get().price();
        BigDecimal marketValue = money(lastPrice.multiply(quantity));
        BigDecimal unrealised = money(marketValue.subtract(costBasis));
        return new PricedPosition(accountId, symbol, position.getQuantity(), averageCost, costBasis,
                lastPrice, marketValue, unrealised, percent(unrealised, costBasis), currency,
                observedAt(quote.get()), isStale(symbol, quote.get()));
    }

    /** Some holdings unpriced is a partial answer; all of them unpriced is MKT-503. */
    private List<PricedPosition> requirePricing(long accountId, List<PricedPosition> holdings) {
        if (!holdings.isEmpty() && holdings.stream().noneMatch(PricedPosition::priced)) {
            throw new PricingUnavailableException(accountId);
        }
        return holdings;
    }

    private boolean countsInTotals(PricedPosition holding) {
        return holding.priced() && baseCurrency.equalsIgnoreCase(holding.currency());
    }

    private boolean isStale(String symbol, QuotePayload quote) {
        if (Boolean.TRUE.equals(quote.stale())) {
            return true;
        }
        return prices.receivedAt(symbol)
                .map(received -> received.plus(maxPriceAge).isBefore(clock.instant()))
                .orElse(true);
    }

    private static OffsetDateTime observedAt(QuotePayload quote) {
        if (quote.quoteAsOf() == null) {
            return null;
        }
        try {
            return OffsetDateTime.parse(quote.quoteAsOf()).withOffsetSameInstant(ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Percentage points against cost basis; null when cost basis is zero. */
    private static BigDecimal percent(BigDecimal pnl, BigDecimal costBasis) {
        if (pnl == null || costBasis == null || costBasis.signum() == 0) {
            return null;
        }
        return pnl.multiply(HUNDRED).divide(costBasis, 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal sum(List<BigDecimal> values) {
        return values.stream().filter(v -> v != null).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal money(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal[] zeros() {
        return new BigDecimal[] {BigDecimal.ZERO.setScale(2), BigDecimal.ZERO.setScale(2)};
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(Instant.now(clock), ZoneOffset.UTC);
    }
}
