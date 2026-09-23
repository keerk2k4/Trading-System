package com.tradeexecutor.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Data wrapper for batch quotes.
 * 
 * Contains the array of BatchQuoteItem objects.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BatchQuotesData {
    
    private List<BatchQuoteItem> quotes;
    
    public BatchQuotesData() {
    }
    
    public List<BatchQuoteItem> getQuotes() {
        return quotes;
    }
    
    public void setQuotes(List<BatchQuoteItem> quotes) {
        this.quotes = quotes;
    }
    
    @Override
    public String toString() {
        return "BatchQuotesData{" +
                "quotes=" + quotes +
                '}';
    }
}
