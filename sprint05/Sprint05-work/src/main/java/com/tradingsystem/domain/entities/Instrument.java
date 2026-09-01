package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.AssetClass;

public class Instrument {

    private final String symbol;
    private final String displayName;
    private final AssetClass assetClass;
    private final String quotationCurrency;

    private boolean delisted;


    public Instrument(
            String symbol,
            String displayName,
            AssetClass assetClass,
            String quotationCurrency
    ) {

        this.symbol = symbol;
        this.displayName = displayName;
        this.assetClass = assetClass;
        this.quotationCurrency = quotationCurrency;
        this.delisted = false;
    }


    public String getSymbol() {
        return symbol;
    }


    public String getDisplayName() {
        return displayName;
    }


    public AssetClass getAssetClass() {
        return assetClass;
    }


    public String getQuotationCurrency() {
        return quotationCurrency;
    }


    public boolean mayBeTraded() {
        return !delisted;
    }


    public void delist() {
        this.delisted = true;
    }
}
