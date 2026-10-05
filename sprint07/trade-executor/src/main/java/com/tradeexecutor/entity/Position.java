package com.tradeexecutor.entity;

/**
 * Position entity for MyBatis mapping.
 * 
 * Simple POJO (not a JPA entity) - used only if needed for MyBatis result mapping.
 * The PositionMapper uses @Select annotations directly for queries.
 */
public class Position {
    private Long positionId;
    private Long accountId;
    private Long instrumentId;
    private String status;

    public Position() {}

    public Long getPositionId() {
        return positionId;
    }

    public void setPositionId(Long positionId) {
        this.positionId = positionId;
    }

    public Long getAccountId() {
        return accountId;
    }

    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }

    public Long getInstrumentId() {
        return instrumentId;
    }

    public void setInstrumentId(Long instrumentId) {
        this.instrumentId = instrumentId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
