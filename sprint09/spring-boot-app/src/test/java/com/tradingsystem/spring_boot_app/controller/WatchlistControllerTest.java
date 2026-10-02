package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.WatchlistDetailResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistStockResponse;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.WatchlistService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WatchlistController.class)
class WatchlistControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private WatchlistService watchlists;

    @MockitoBean
    private AuthService authService;

    private void auth() {
        when(authService.authenticatedAccountId(org.mockito.ArgumentMatchers.any(HttpServletRequest.class)))
                .thenReturn(1L);
    }

    @Test
    void getWatchlistsAnswers200() throws Exception {
        auth();
        when(watchlists.getWatchlists(1L)).thenReturn(List.of(
                new WatchlistResponse(1L, "Default", true, List.of("AAPL"))));

        mvc.perform(get("/api/v1/watchlists").header("Authorization", "Bearer t"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Default"));
    }

    @Test
    void getWatchlistDetailCarriesLivePrice() throws Exception {
        auth();
        when(watchlists.getWatchlist(anyLong(), anyLong())).thenReturn(
                new WatchlistDetailResponse(1L, "Default", true, List.of(
                        new WatchlistStockResponse("AAPL", "Apple Inc.",
                                new BigDecimal("245.30"), new BigDecimal("1.25"), new BigDecimal("0.51")))));

        mvc.perform(get("/api/v1/watchlists/1").header("Authorization", "Bearer t"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stocks[0].price").value(245.30));
    }

    @Test
    void createWatchlistAnswers201() throws Exception {
        auth();
        when(watchlists.createWatchlist(anyLong(), anyString())).thenReturn(
                new WatchlistResponse(2L, "Tech", false, List.of()));

        mvc.perform(post("/api/v1/watchlists").header("Authorization", "Bearer t")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Tech\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Tech"));
    }

    @Test
    void deleteWatchlistAnswers204() throws Exception {
        auth();

        mvc.perform(delete("/api/v1/watchlists/2").header("Authorization", "Bearer t"))
                .andExpect(status().isNoContent());
    }
}
