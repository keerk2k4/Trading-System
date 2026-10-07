package com.tradingsystem.spring_boot_app.exception;

public class StrategyNotFoundException extends RuntimeException {
    public StrategyNotFoundException(Long strategyId) {
        super("Strategy not found: " + strategyId);
    }
}
