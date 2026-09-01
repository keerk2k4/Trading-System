package com.tradingsystem.exception;

public class InstrumentNotFoundException extends DomainException {

    private final String symbol;

    public InstrumentNotFoundException(String symbol) {
        super("INS-404", "Instrument not found");
        this.symbol = symbol;
    }

    public String getSymbol() {
        return symbol;
    }
}
