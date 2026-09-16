
package com.tradingsystem.domain.services;

import com.tradingsystem.domain.entities.Instrument;

import java.math.BigDecimal;

public interface MarketPriceProvider {

    BigDecimal getMarketPrice(Instrument instrument);
}


