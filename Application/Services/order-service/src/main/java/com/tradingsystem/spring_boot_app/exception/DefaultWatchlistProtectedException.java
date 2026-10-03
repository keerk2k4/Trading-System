package com.tradingsystem.spring_boot_app.exception;

public class DefaultWatchlistProtectedException extends IllegalStateException {
    public DefaultWatchlistProtectedException() {
        super("The default watchlist cannot be deleted.");
    }
}
