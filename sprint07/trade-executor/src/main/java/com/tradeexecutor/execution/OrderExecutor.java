package com.tradeexecutor.execution;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Order;
import com.tradeexecutor.client.FauxnanceClient;
import com.tradeexecutor.client.QuoteResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Orchestrates order execution.
 * 
 * Coordinates the process of:
 * 1. Checking instrument tradability
 * 2. Fetching live quotes from Fauxnance
 * 3. Applying the fill rule
 * 4. Returning execution decision/result
 * 
 * NOTE: This class does NOT persist results. Persistence is handled
 * by the calling service layer after execution decision is made.
 */
@Component
public class OrderExecutor {
    
    private static final Logger logger = LoggerFactory.getLogger(OrderExecutor.class);
    
    private final FauxnanceClient fauxnanceClient;
    private final FillRule fillRule;
    
    public OrderExecutor(FauxnanceClient fauxnanceClient) {
        this.fauxnanceClient = fauxnanceClient;
        this.fillRule = DefaultFillRule.INSTANCE;  // Default fill rule
    }
    
    /**
     * Execute an order by applying the fill rule with a live quote.
     * 
     * Execution flow:
     * 1. Check if instrument is tradable
     * 2. Fetch live quote from Fauxnance
     * 3. Apply fill rule with order and quote
     * 4. Return execution decision
     * 
     * @param order The order to execute
     * @param instrument The instrument being traded
     * @return ExecutionDecision containing the result
     */
    public ExecutionDecision execute(Order order, Instrument instrument) {
        logger.info("Executing order {} for instrument {}", order.getOrderId(), instrument.getSymbol());
        
        // Step 1: Check instrument tradability
        if (!instrument.mayBeTraded()) {
            logger.warn("Instrument {} is not tradable", instrument.getSymbol());
            ExecutionResult result = ExecutionResult.instrumentNotTradable(
                "Instrument " + instrument.getSymbol() + " is not tradable"
            );
            return new ExecutionDecision(result, fillRule.getName());
        }
        
        // Step 2: Fetch live quote from Fauxnance
        Optional<QuoteResponse> quoteOpt = fauxnanceClient.getQuote(instrument.getSymbol());
        
        if (quoteOpt.isEmpty()) {
            logger.warn("Failed to obtain quote for {} after retry budget exhausted", 
                instrument.getSymbol());
            ExecutionResult result = ExecutionResult.pricingUnavailable(
                "Unable to obtain quote for " + instrument.getSymbol() + 
                " from Fauxnance after retry budget exhausted"
            );
            return new ExecutionDecision(result, fillRule.getName());
        }
        
        QuoteResponse quote = quoteOpt.get();
        BigDecimal quotedPrice = quote.getPrice();
        
        if (quotedPrice == null) {
            logger.warn("Quote for {} has null price", instrument.getSymbol());
            ExecutionResult result = ExecutionResult.pricingUnavailable(
                "Quote for " + instrument.getSymbol() + " has no price data"
            );
            return new ExecutionDecision(result, fillRule.getName());
        }
        
        // Step 3: Apply fill rule (pure function - no side effects)
        ExecutionResult result = fillRule.evaluate(order, quotedPrice);
        
        logger.info("Execution result for order {}: {}", order.getOrderId(), result);
        
        // Step 4: Return execution decision
        return new ExecutionDecision(result, fillRule.getName());
    }
}

