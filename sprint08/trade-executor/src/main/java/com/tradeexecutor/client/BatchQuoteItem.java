package com.tradeexecutor.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Individual item in a batch quotes response.
 * 
 * Each item has a symbol and either a successful quote or an error.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BatchQuoteItem {
    
    private String symbol;
    private String source;
    private Boolean stale;
    private QuoteResponse quote;
    private Object error;
    
    public BatchQuoteItem() {
    }
    
    public String getSymbol() {
        return symbol;
    }
    
    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }
    
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    public Boolean getStale() {
        return stale;
    }
    
    public void setStale(Boolean stale) {
        this.stale = stale;
    }
    
    public QuoteResponse getQuote() {
        return quote;
    }
    
    public void setQuote(QuoteResponse quote) {
        this.quote = quote;
    }
    
    public Object getError() {
        return error;
    }
    
    public void setError(Object error) {
        this.error = error;
    }
    
    public boolean hasError() {
        return error != null;
    }
    
    @Override
    public String toString() {
        return "BatchQuoteItem{" +
                "symbol='" + symbol + '\'' +
                ", source='" + source + '\'' +
                ", stale=" + stale +
                ", quote=" + quote +
                ", error=" + error +
                '}';
    }
}
