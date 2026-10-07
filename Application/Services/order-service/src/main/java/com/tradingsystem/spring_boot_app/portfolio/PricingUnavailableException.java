package com.tradingsystem.spring_boot_app.portfolio;

/** No held instrument could be priced: answered as 503 MKT-503. */
public class PricingUnavailableException extends RuntimeException {
    public PricingUnavailableException(long accountId) {
        super("No price available for any holding of account " + accountId);
    }
}
