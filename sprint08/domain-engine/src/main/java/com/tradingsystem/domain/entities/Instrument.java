package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.AssetClass;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class Instrument {

    private final Long instrumentId;
    @NotBlank
    @Size(max = 20)
    private final String symbol;

    @NotBlank
    @Size(max = 200)
    private final String displayName;

    @NotNull
    private final AssetClass assetClass;

    @NotBlank
    @Size(min = 3, max = 3)
    private final String quotationCurrency;

    private boolean delisted;

    public Instrument(
            String symbol,
            String displayName,
            AssetClass assetClass,
            String quotationCurrency
    ) {
        this(null, symbol, displayName, assetClass, quotationCurrency);
        }

        public Instrument(
            Long instrumentId,
            String symbol,
            String displayName,
            AssetClass assetClass,
            String quotationCurrency
        ) {
        validateString(symbol, "Symbol");
        validateString(displayName, "Display name");
        validateString(quotationCurrency, "Quotation currency");

        if (assetClass == null) {
            throw new IllegalArgumentException(
                    "Asset class cannot be null"
            );
        }

        this.instrumentId = instrumentId;
        this.symbol = symbol;
        this.displayName = displayName;
        this.assetClass = assetClass;
        this.quotationCurrency = quotationCurrency;
        this.delisted = false;
    }


    public Long getInstrumentId() {return instrumentId;}
    public String getSymbol() {return symbol;}
    public String getDisplayName() {return displayName;}
    public AssetClass getAssetClass() {return assetClass;}
    public String getQuotationCurrency() {return quotationCurrency;}

    public boolean mayBeTraded() {
        return !delisted;
    }

    public void delist() {
        this.delisted = true;
    }

    private void validateString(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " cannot be blank"
            );
        }
    }
}