package com.tradeexecutor.execution;

/**
 * Encapsulates a decision to execute an order.
 * 
 * Contains the result of applying a fill rule to an order and quote.
 * This is an immutable record of the decision and its reasoning.
 */
public class ExecutionDecision {
    
    private final ExecutionResult result;
    private final String fillRuleName;
    
    public ExecutionDecision(ExecutionResult result, String fillRuleName) {
        this.result = result;
        this.fillRuleName = fillRuleName;
    }
    
    public ExecutionResult getResult() {
        return result;
    }
    
    public String getFillRuleName() {
        return fillRuleName;
    }
    
    public boolean isFilled() {
        return result.getStatus() == ExecutionResult.Status.FILLED;
    }
    
    @Override
    public String toString() {
        return "ExecutionDecision{" +
                "result=" + result +
                ", fillRuleName='" + fillRuleName + '\'' +
                '}';
    }
}

