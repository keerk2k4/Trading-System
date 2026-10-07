package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.InstrumentResponse;
import com.tradingsystem.spring_boot_app.dto.QuoteResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistStockResponse;
import com.tradingsystem.spring_boot_app.kafka.QuotePayload;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.OrderService;
import com.tradingsystem.spring_boot_app.service.WatchlistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Tag(name = "Instruments", description = "Search tradable instruments")
@RequestMapping("/api/v1/instruments")
public class InstrumentController {

    private final WatchlistService watchlists;
    private final AuthService authService;
    private final OrderService orders;

    public InstrumentController(WatchlistService watchlists, AuthService authService, OrderService orders) {
        this.watchlists = watchlists;
        this.authService = authService;
        this.orders = orders;
    }

    @Operation(summary = "Search instruments by symbol or name")
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<InstrumentResponse>> searchInstruments(
            @RequestParam(value = "search", required = false) String search,
            HttpServletRequest request) {
        authService.authenticatedAccountId(request);
        return ResponseEntity.ok(watchlists.searchInstruments(search == null ? "" : search));
    }

    @Operation(summary = "Latest cached quote for a MARKET ticket")
    @GetMapping(value = "/{symbol}/quote", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<QuoteResponse> getQuote(
            @PathVariable("symbol") String symbol,
            HttpServletRequest request) {
        authService.authenticatedAccountId(request);
        String key = symbol == null ? "" : symbol.trim().toUpperCase();
        QuotePayload quote = orders.latestQuote(key)
                .orElseThrow(() -> new com.tradingsystem.exception.InstrumentNotFoundException(key));
        return ResponseEntity.ok(new QuoteResponse(quote.symbol(), quote.price(), quote.bid(), quote.ask(),
                quote.currency(), quote.change(), quote.changePercent()));
    }
}
