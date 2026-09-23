package com.tradeexecutor.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.Map;

/**
 * Wrapper for Fauxnance API quote response.
 * 
 * The API returns responses wrapped in data/meta structure.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class QuoteResponseWrapper {
    
    private QuoteResponse data;
    private Map<String, Object> meta;
    
    public QuoteResponseWrapper() {
    }
    
    public QuoteResponseWrapper(QuoteResponse data, Map<String, Object> meta) {
        this.data = data;
        this.meta = meta;
    }
    
    public QuoteResponse getData() {
        return data;
    }
    
    public void setData(QuoteResponse data) {
        this.data = data;
    }
    
    public Map<String, Object> getMeta() {
        return meta;
    }
    
    public void setMeta(Map<String, Object> meta) {
        this.meta = meta;
    }
    
    @Override
    public String toString() {
        return "QuoteResponseWrapper{" +
                "data=" + data +
                ", meta=" + meta +
                '}';
    }
}
