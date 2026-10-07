package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.exception.AccountNotActiveException;
import com.tradingsystem.exception.AccountNotFoundException;
import com.tradingsystem.exception.InvalidOrderArgumentException;
import com.tradingsystem.spring_boot_app.exception.UnauthorisedException;
import com.tradingsystem.spring_boot_app.portfolio.dto.PnlResponse;
import com.tradingsystem.spring_boot_app.portfolio.dto.PortfolioSummary;
import com.tradingsystem.spring_boot_app.portfolio.dto.PricedPosition;
import com.tradingsystem.spring_boot_app.portfolio.dto.SymbolPnl;
import com.tradingsystem.spring_boot_app.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PortfolioController.class)
class PortfolioControllerTest {

    private static final String TOKEN = "Bearer test-token";
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-07T14:00:00Z");

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PortfolioService portfolio;

    @MockitoBean
    private AuthService authService;

    /** The token belongs to account 6; any other account in the path is ACC-403. */
    @BeforeEach
    void mockAuthGuard() {
        doAnswer(invocation -> {
            HttpServletRequest request = invocation.getArgument(0);
            long requested = invocation.getArgument(1);
            String authorization = request.getHeader("Authorization");
            if (authorization == null || !authorization.startsWith("Bearer ")) {
                throw new UnauthorisedException();
            }
            if (requested != 6L) {
                throw new AccountNotActiveException(requested);
            }
            return null;
        }).when(authService).verifyAccountAccess(any(HttpServletRequest.class), anyLong());
    }

    @Test
    void summaryAnswersWithTheContractFields() throws Exception {
        when(portfolio.summary(6L)).thenReturn(new PortfolioSummary(6L, "USD", new BigDecimal("41847.05"),
                new BigDecimal("10043.35"), new BigDecimal("8276.20"), new BigDecimal("1767.15"),
                new BigDecimal("21.35"), new BigDecimal("123.30"), new BigDecimal("51890.40"), 3, false, NOW));

        mvc.perform(get("/api/v1/portfolio/{id}", 6).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(6))
                .andExpect(jsonPath("$.baseCurrency").value("USD"))
                .andExpect(jsonPath("$.cashBalance").value(41847.05))
                .andExpect(jsonPath("$.marketValue").value(10043.35))
                .andExpect(jsonPath("$.costBasis").value(8276.20))
                .andExpect(jsonPath("$.unrealisedPnl").value(1767.15))
                .andExpect(jsonPath("$.unrealisedPnlPercent").value(21.35))
                .andExpect(jsonPath("$.realisedPnl").value(123.30))
                .andExpect(jsonPath("$.totalValue").value(51890.40))
                .andExpect(jsonPath("$.positionCount").value(3))
                .andExpect(jsonPath("$.partial").value(false))
                .andExpect(jsonPath("$.asOf").value("2026-10-07T14:00:00Z"));
    }

    @Test
    void anotherCustomersAccountIsForbiddenNotNotFound() throws Exception {
        mvc.perform(get("/api/v1/portfolio/{id}", 2).header("Authorization", TOKEN))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"));
        mvc.perform(get("/api/v1/portfolio/{id}/positions", 2).header("Authorization", TOKEN))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/portfolio/{id}/pnl", 2).header("Authorization", TOKEN))
                .andExpect(status().isForbidden());
        verifyNoInteractions(portfolio);
    }

    @Test
    void noTokenIsUnauthorised() throws Exception {
        mvc.perform(get("/api/v1/portfolio/{id}", 6))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
    }

    @Test
    void unknownAccountIsNotFound() throws Exception {
        when(portfolio.summary(6L)).thenThrow(new AccountNotFoundException(6L));

        mvc.perform(get("/api/v1/portfolio/{id}", 6).header("Authorization", TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("ACC-404"));
    }

    @Test
    void noPriceForAnyHoldingIsMkt503() throws Exception {
        when(portfolio.summary(6L)).thenThrow(new PricingUnavailableException(6L));

        mvc.perform(get("/api/v1/portfolio/{id}", 6).header("Authorization", TOKEN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("MKT-503"))
                .andExpect(jsonPath("$.message").value("Pricing unavailable"));
    }

    @Test
    void unpricedPositionKeepsItsFieldsAsNull() throws Exception {
        when(portfolio.positions(6L, "MSFT")).thenReturn(List.of(new PricedPosition(6L, "MSFT", 5,
                new BigDecimal("407.77"), new BigDecimal("2038.85"), null, null, null, null, "USD", null, true)));

        mvc.perform(get("/api/v1/portfolio/{id}/positions", 6).param("symbol", "MSFT")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].symbol").value("MSFT"))
                .andExpect(jsonPath("$[0].costBasis").value(2038.85))
                .andExpect(jsonPath("$[0].lastPrice").isEmpty())
                .andExpect(jsonPath("$[0].marketValue").isEmpty())
                .andExpect(jsonPath("$[0].priceAsOf").isEmpty())
                .andExpect(jsonPath("$[0].stale").value(true))
                .andExpect(jsonPath("$[0].priced").doesNotExist());
    }

    @Test
    void pnlPassesTheDateRangeAndBreakdown() throws Exception {
        LocalDate from = LocalDate.parse("2026-08-01");
        LocalDate to = LocalDate.parse("2026-08-31");
        when(portfolio.pnl(6L, from, to, true)).thenReturn(new PnlResponse(6L, "USD", from, to,
                new BigDecimal("123.30"), new BigDecimal("318.30"), new BigDecimal("441.60"),
                List.of(new SymbolPnl("NVDA", new BigDecimal("123.30"), new BigDecimal("318.30"),
                        new BigDecimal("441.60"))), NOW));

        mvc.perform(get("/api/v1/portfolio/{id}/pnl", 6).param("from", "2026-08-01").param("to", "2026-08-31")
                        .param("bySymbol", "true").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2026-08-01"))
                .andExpect(jsonPath("$.to").value("2026-08-31"))
                .andExpect(jsonPath("$.realisedPnl").value(123.30))
                .andExpect(jsonPath("$.totalPnl").value(441.60))
                .andExpect(jsonPath("$.bySymbol[0].symbol").value("NVDA"));
    }

    @Test
    void pnlWithoutBreakdownOmitsTheField() throws Exception {
        when(portfolio.pnl(eq(6L), any(), any(), eq(false))).thenReturn(new PnlResponse(6L, "USD", null, null,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, null, NOW));

        mvc.perform(get("/api/v1/portfolio/{id}/pnl", 6).header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bySymbol").doesNotExist())
                .andExpect(jsonPath("$.from").isEmpty());
    }

    @Test
    void invalidDatesAreVal422() throws Exception {
        when(portfolio.pnl(eq(6L), any(), any(), eq(false)))
                .thenThrow(new InvalidOrderArgumentException("from", "2026-10-01"));

        mvc.perform(get("/api/v1/portfolio/{id}/pnl", 6).param("from", "2026-10-01").param("to", "2026-09-01")
                        .header("Authorization", TOKEN))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        mvc.perform(get("/api/v1/portfolio/{id}/pnl", 6).param("from", "not-a-date")
                        .header("Authorization", TOKEN))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }
}
