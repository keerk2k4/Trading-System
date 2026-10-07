package com.tradingsystem.spring_boot_app.portfolio;

import com.tradingsystem.spring_boot_app.service.LatestPriceCache;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PortfolioHealthController.class)
class PortfolioHealthControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PortfolioMapper portfolio;

    @MockitoBean
    private LatestPriceCache prices;

    @Test
    void okWhenTheDatabaseAnswersAndAQuoteArrivedRecently() throws Exception {
        when(portfolio.ping()).thenReturn(1);
        when(prices.lastReceivedAt()).thenReturn(Optional.of(Instant.now()));

        mvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.dependencies[0].name").value("postgres"))
                .andExpect(jsonPath("$.dependencies[0].status").value("ok"))
                .andExpect(jsonPath("$.dependencies[1].name").value("fauxnance"))
                .andExpect(jsonPath("$.dependencies[1].status").value("ok"))
                .andExpect(jsonPath("$.dependencies[1].quotaRemaining").isEmpty())
                .andExpect(jsonPath("$.asOf").exists());
    }

    @Test
    void aFailingDependencyDegradesTheStatusButNotTheResponse() throws Exception {
        when(portfolio.ping()).thenThrow(new RuntimeException("connection refused"));
        when(prices.lastReceivedAt()).thenReturn(Optional.empty());

        mvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("degraded"))
                .andExpect(jsonPath("$.dependencies[0].status").value("down"))
                .andExpect(jsonPath("$.dependencies[1].status").value("down"));
    }

    @Test
    void quotesOlderThanTheFreshnessWindowAreDegraded() throws Exception {
        when(portfolio.ping()).thenReturn(1);
        when(prices.lastReceivedAt()).thenReturn(Optional.of(Instant.now().minusSeconds(3600)));

        mvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("degraded"))
                .andExpect(jsonPath("$.dependencies[1].status").value("degraded"));
    }
}
