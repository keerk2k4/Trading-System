package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.domain.entities.Account;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.AssetClass;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.exception.AccountNotFoundException;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Figures from the seeded demo account (see seed/003_portfolio_demo_data.sql):
 * AAPL 15 @ 277.55, MSFT 5 @ 407.77, NVDA 10 @ 207.41, cash 41847.05, and one
 * NVDA sale booking +123.30 realised.
 */
@ExtendWith(MockitoExtension.class)
class PortfolioServiceTest {

    private static final long ACCOUNT = 6L;
    private static final Instant NOW = Instant.parse("2026-10-07T14:00:00Z");
    private static final Duration MAX_AGE = Duration.ofMinutes(5);

    @Mock
    private PositionMapper positions;
    @Mock
    private PortfolioMapper portfolio;
    @Mock
    private AccountService accounts;

    private final Account account = mock(Account.class);
    private Clock clock;
    private LatestPriceCache prices;
    private PortfolioService service;

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(NOW, ZoneOffset.UTC);
        prices = new LatestPriceCache(clock);
        service = new PortfolioService(positions, portfolio, accounts, prices, MAX_AGE, "USD", clock);
    }

    @Test
    void summaryPricesHoldingsAndAddsBookedRealisedPnl() {
        cash("41847.05");
        holdings(position("AAPL", 15, "277.55"), position("MSFT", 5, "407.77"), position("NVDA", 10, "207.41"));
        quote("AAPL", "333.63", false);
        quote("MSFT", "529.30", false);
        quote("NVDA", "239.24", false);
        when(portfolio.realisedPnlBySymbol(ACCOUNT, null, null))
                .thenReturn(List.of(new RealisedPnlRow("NVDA", new BigDecimal("123.30"))));

        PortfolioSummary summary = service.summary(ACCOUNT);

        // costBasis 4163.25 + 2038.85 + 2074.10; marketValue 5004.45 + 2646.50 + 2392.40
        assertAll(
                () -> assertEquals(ACCOUNT, summary.accountId()),
                () -> assertEquals("USD", summary.baseCurrency()),
                () -> assertEquals(new BigDecimal("41847.05"), summary.cashBalance()),
                () -> assertEquals(new BigDecimal("8276.20"), summary.costBasis()),
                () -> assertEquals(new BigDecimal("10043.35"), summary.marketValue()),
                () -> assertEquals(new BigDecimal("1767.15"), summary.unrealisedPnl()),
                () -> assertEquals(new BigDecimal("21.35"), summary.unrealisedPnlPercent()),
                () -> assertEquals(new BigDecimal("123.30"), summary.realisedPnl()),
                () -> assertEquals(new BigDecimal("51890.40"), summary.totalValue()),
                () -> assertEquals(3, summary.positionCount()),
                () -> assertFalse(summary.partial()),
                () -> assertEquals(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC), summary.asOf()));
    }

    @Test
    void realisedPnlDoesNotMoveWithTheCurrentPrice() {
        cash("100.00");
        holdings(position("NVDA", 10, "207.41"));
        when(portfolio.realisedPnlBySymbol(ACCOUNT, null, null))
                .thenReturn(List.of(new RealisedPnlRow("NVDA", new BigDecimal("123.30"))));

        quote("NVDA", "239.24", false);
        BigDecimal before = service.summary(ACCOUNT).realisedPnl();
        quote("NVDA", "50.00", false);
        PortfolioSummary after = service.summary(ACCOUNT);

        assertEquals(new BigDecimal("123.30"), before);
        assertEquals(before, after.realisedPnl());
        assertEquals(new BigDecimal("-1574.10"), after.unrealisedPnl());
    }

    @Test
    void someHoldingsUnpricedIsAPartialAnswer() {
        cash("1000.00");
        holdings(position("AAPL", 15, "277.55"), position("MSFT", 5, "407.77"));
        quote("AAPL", "333.63", false);

        PortfolioSummary summary = service.summary(ACCOUNT);
        List<PricedPosition> priced = service.positions(ACCOUNT, null);

        PricedPosition msft = priced.get(1);
        assertAll(
                () -> assertTrue(summary.partial()),
                () -> assertEquals(2, summary.positionCount()),
                () -> assertEquals(new BigDecimal("5004.45"), summary.marketValue()),
                () -> assertEquals(new BigDecimal("4163.25"), summary.costBasis()),
                () -> assertEquals(new BigDecimal("6004.45"), summary.totalValue()),
                () -> assertEquals("MSFT", msft.symbol()),
                () -> assertEquals(new BigDecimal("2038.85"), msft.costBasis()),
                () -> assertNull(msft.lastPrice()),
                () -> assertNull(msft.marketValue()),
                () -> assertNull(msft.unrealisedPnl()),
                () -> assertNull(msft.unrealisedPnlPercent()),
                () -> assertNull(msft.priceAsOf()),
                () -> assertTrue(msft.stale()));
    }

    @Test
    void noHoldingPricedIsPricingUnavailable() {
        cash("1000.00");
        holdings(position("AAPL", 15, "277.55"));

        assertThrows(PricingUnavailableException.class, () -> service.summary(ACCOUNT));
        assertThrows(PricingUnavailableException.class, () -> service.positions(ACCOUNT, null));
        assertThrows(PricingUnavailableException.class, () -> service.pnl(ACCOUNT, null, null, false));
    }

    @Test
    void anAccountWithNoHoldingsIsNotAPricingFailure() {
        cash("500.00");
        holdings();

        PortfolioSummary summary = service.summary(ACCOUNT);

        assertAll(
                () -> assertEquals(0, summary.positionCount()),
                () -> assertFalse(summary.partial()),
                () -> assertEquals(new BigDecimal("0.00"), summary.marketValue()),
                () -> assertNull(summary.unrealisedPnlPercent()),
                () -> assertEquals(new BigDecimal("500.00"), summary.totalValue()));
    }

    @Test
    void aQuoteMarkedStaleIsServedAndMarked() {
        cash("0.00");
        holdings(position("AAPL", 15, "277.55"));
        quote("AAPL", "333.63", true);

        PricedPosition aapl = service.positions(ACCOUNT, null).get(0);

        assertEquals(new BigDecimal("333.63"), aapl.lastPrice());
        assertEquals(new BigDecimal("5004.45"), aapl.marketValue());
        assertTrue(aapl.stale());
        assertEquals(OffsetDateTime.parse("2026-10-07T13:59:30Z"), aapl.priceAsOf());
    }

    @Test
    void aQuoteNotRefreshedWithinTheFreshnessWindowIsStale() {
        cash("0.00");
        holdings(position("AAPL", 15, "277.55"));
        quote("AAPL", "333.63", false);
        PortfolioService later = new PortfolioService(positions, portfolio, accounts, prices, MAX_AGE, "USD",
                Clock.fixed(NOW.plus(Duration.ofMinutes(6)), ZoneOffset.UTC));

        assertFalse(service.positions(ACCOUNT, null).get(0).stale());
        assertTrue(later.positions(ACCOUNT, null).get(0).stale());
    }

    @Test
    void positionsCanBeRestrictedToOneSymbol() {
        cash("0.00");
        holdings(position("AAPL", 15, "277.55"), position("MSFT", 5, "407.77"));
        quote("MSFT", "529.30", false);

        List<PricedPosition> result = service.positions(ACCOUNT, "msft");

        assertEquals(1, result.size());
        assertEquals("MSFT", result.get(0).symbol());
        assertEquals(new BigDecimal("607.65"), result.get(0).unrealisedPnl());
        assertEquals(new BigDecimal("29.80"), result.get(0).unrealisedPnlPercent());
    }

    @Test
    void pnlSplitsRealisedAndUnrealisedBySymbol() {
        cash("0.00");
        holdings(position("AAPL", 15, "277.55"), position("NVDA", 10, "207.41"));
        quote("AAPL", "333.63", false);
        quote("NVDA", "239.24", false);
        LocalDate from = LocalDate.parse("2026-08-01");
        LocalDate to = LocalDate.parse("2026-08-31");
        when(portfolio.realisedPnlBySymbol(ACCOUNT, from, to)).thenReturn(List.of(
                new RealisedPnlRow("NVDA", new BigDecimal("123.30")),
                new RealisedPnlRow("TSLA", new BigDecimal("-40.00"))));

        PnlResponse pnl = service.pnl(ACCOUNT, from, to, true);

        assertAll(
                () -> assertEquals(from, pnl.from()),
                () -> assertEquals(to, pnl.to()),
                () -> assertEquals(new BigDecimal("83.30"), pnl.realisedPnl()),
                () -> assertEquals(new BigDecimal("1159.50"), pnl.unrealisedPnl()),
                () -> assertEquals(new BigDecimal("1242.80"), pnl.totalPnl()),
                () -> assertEquals(List.of(
                        new SymbolPnl("AAPL", new BigDecimal("0.00"), new BigDecimal("841.20"), new BigDecimal("841.20")),
                        new SymbolPnl("NVDA", new BigDecimal("123.30"), new BigDecimal("318.30"), new BigDecimal("441.60")),
                        new SymbolPnl("TSLA", new BigDecimal("-40.00"), new BigDecimal("0.00"), new BigDecimal("-40.00"))),
                        pnl.bySymbol()));
    }

    @Test
    void pnlLeavesOutTheBreakdownUnlessAskedFor() {
        cash("0.00");
        holdings();
        when(portfolio.realisedPnlBySymbol(eq(ACCOUNT), any(), any())).thenReturn(List.of());

        assertNull(service.pnl(ACCOUNT, null, null, false).bySymbol());
    }

    @Test
    void pnlRejectsFromLaterThanTo() {
        assertThrows(InvalidOrderArgumentException.class, () -> service.pnl(ACCOUNT,
                LocalDate.parse("2026-10-01"), LocalDate.parse("2026-09-01"), false));
        verifyNoInteractions(positions, portfolio, accounts);
    }

    @Test
    void anUnknownAccountIsNotFound() {
        when(accounts.getBalance(99L)).thenThrow(new AccountNotFoundException(99L));

        assertThrows(AccountNotFoundException.class, () -> service.summary(99L));
        verifyNoInteractions(positions, portfolio);
    }

    @Test
    void aHoldingInAnotherCurrencyIsShownButLeftOutOfTheTotals() {
        cash("0.00");
        holdings(position("AAPL", 15, "277.55"), position("INFY.NS", "INR", 40, "1580.25"));
        quote("AAPL", "333.63", false);
        quote("INFY.NS", "1600.00", false);

        PortfolioSummary summary = service.summary(ACCOUNT);

        assertTrue(summary.partial());
        assertEquals(new BigDecimal("5004.45"), summary.marketValue());
        verify(positions, org.mockito.Mockito.atLeastOnce()).findPositionsByAccountId(ACCOUNT);
    }

    private void cash(String amount) {
        when(accounts.getBalance(ACCOUNT)).thenReturn(new BalanceResponse(ACCOUNT, new BigDecimal(amount), "USD",
                OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC)));
    }

    private void holdings(Position... held) {
        when(positions.findPositionsByAccountId(ACCOUNT)).thenReturn(List.of(held));
    }

    private Position position(String symbol, int quantity, String averageCost) {
        return position(symbol, "USD", quantity, averageCost);
    }

    private Position position(String symbol, String currency, int quantity, String averageCost) {
        Instrument instrument = new Instrument(1L, symbol, symbol + " Inc.", AssetClass.EQUITY, currency);
        return new Position(1L, account, instrument, ProductType.INTRADAY, quantity, new BigDecimal(averageCost),
                BigDecimal.ZERO, "OPEN", null, null, null);
    }

    private void quote(String symbol, String price, boolean stale) {
        prices.update(new QuotePayload(symbol, new BigDecimal(price), new BigDecimal(price), new BigDecimal(price),
                "USD", null, null, null, "open", stale, "2026-10-07T13:59:30Z"));
    }
}
