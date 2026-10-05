package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.spring_boot_app.dto.AddWatchlistInstrumentRequest;
import com.tradingsystem.spring_boot_app.dto.CreateWatchlistRequest;
import com.tradingsystem.spring_boot_app.dto.WatchlistDetailResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistResponse;
import com.tradingsystem.spring_boot_app.dto.WatchlistStockResponse;
import com.tradingsystem.spring_boot_app.service.AuthService;
import com.tradingsystem.spring_boot_app.service.WatchlistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Tag(name = "Watchlists", description = "The signed-in trader's watchlists and the instruments on them")
@RequestMapping("/api/v1/watchlists")
public class WatchlistController {

    private final WatchlistService watchlists;
    private final AuthService authService;

    public WatchlistController(WatchlistService watchlists, AuthService authService) {
        this.watchlists = watchlists;
        this.authService = authService;
    }

    @Operation(summary = "List the signed-in trader's watchlists")
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<WatchlistResponse>> getWatchlists(HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(watchlists.getWatchlists(accountId));
    }

    @Operation(summary = "Create a watchlist")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<WatchlistResponse> createWatchlist(
            @Valid @RequestBody CreateWatchlistRequest body,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        WatchlistResponse created = watchlists.createWatchlist(accountId, body.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Get a watchlist with its instruments and latest prices")
    @GetMapping(value = "/{watchlistId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<WatchlistDetailResponse> getWatchlist(
            @PathVariable("watchlistId") long watchlistId,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        return ResponseEntity.ok(watchlists.getWatchlist(accountId, watchlistId));
    }

    @Operation(summary = "Delete a watchlist")
    @DeleteMapping("/{watchlistId}")
    public ResponseEntity<Void> deleteWatchlist(
            @PathVariable("watchlistId") long watchlistId,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        watchlists.deleteWatchlist(accountId, watchlistId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Add an instrument to a watchlist")
    @PostMapping(value = "/{watchlistId}/instruments",
            consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<WatchlistStockResponse> addInstrument(
            @PathVariable("watchlistId") long watchlistId,
            @Valid @RequestBody AddWatchlistInstrumentRequest body,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        WatchlistStockResponse added = watchlists.addInstrument(accountId, watchlistId, body.symbol());
        return ResponseEntity.status(HttpStatus.CREATED).body(added);
    }

    @Operation(summary = "Remove an instrument from a watchlist")
    @DeleteMapping("/{watchlistId}/instruments/{symbol}")
    public ResponseEntity<Void> removeInstrument(
            @PathVariable("watchlistId") long watchlistId,
            @PathVariable("symbol") String symbol,
            HttpServletRequest request) {
        long accountId = authService.authenticatedAccountId(request);
        watchlists.removeInstrument(accountId, watchlistId, symbol);
        return ResponseEntity.noContent().build();
    }
}
