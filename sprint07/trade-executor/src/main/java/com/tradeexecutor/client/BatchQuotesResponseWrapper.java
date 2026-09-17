package com.tradeexecutor.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Wrapper for Fauxnance batch quotes API response.
 * 
 * The batch /quotes endpoint returns a structured response with a quotes array.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BatchQuotesResponseWrapper {
    
    private BatchQuotesData data;
    
    public BatchQuotesResponseWrapper() {
    }
    
    public BatchQuotesData getData() {
        return data;
    }
    
    public void setData(BatchQuotesData data) {
        this.data = data;
    }
    
    @Override
    public String toString() {
        return "BatchQuotesResponseWrapper{" +
                "data=" + data +
                '}';
    }
}
