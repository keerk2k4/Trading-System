
package com.tradingsystem.exception;

public class InstrumentDelistedException extends DomainException {

    private final String symbol;

    public InstrumentDelistedException(String symbol) {
        super("INS-403", "Instrument delisted");
        this.symbol = symbol;
    }

    public String getSymbol() {
        return symbol;
    }
}

