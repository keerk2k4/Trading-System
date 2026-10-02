package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.InstrumentResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistStockResponse;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.WatchlistService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/instruments")
public class InstrumentController {

    private final WatchlistService watchlists;
    private final AuthService authService;

    public InstrumentController(WatchlistService watchlists, AuthService authService) {
        this.watchlists = watchlists;
        this.authService = authService;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<InstrumentResponse>> searchInstruments(
            @RequestParam(value = "search", required = false) String search,
            HttpServletRequest request) {
        authService.authenticatedAccountId(request);
        return ResponseEntity.ok(watchlists.searchInstruments(search == null ? "" : search));
    }
}
