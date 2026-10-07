package com.tradingsystem.spring_boot_app.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.tradingsystem.domain.enums.OrderSide;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * Request body for creating a strategy trigger that submits a MARKET order
 * when a quote reaches the configured threshold.
 */
public class CreateStrategyRequest {

    @NotNull
    @Size(min = 1, max = 20)
    private final String symbol;

    @NotNull
    private final OrderSide side;

    @NotNull
    @DecimalMin(value = "0.01")
    @Digits(integer = 17, fraction = 2)
    private final BigDecimal targetPrice;

    @NotNull
    @Min(1)
    private final Integer quantity;

    @JsonCreator
    public CreateStrategyRequest(
            @JsonProperty("symbol") String symbol,
            @JsonProperty("side") OrderSide side,
            @JsonProperty("targetPrice") BigDecimal targetPrice,
            @JsonProperty("quantity") Integer quantity) {
        this.symbol = symbol;
        this.side = side == null ? OrderSide.BUY : side;
        this.targetPrice = targetPrice;
        this.quantity = quantity == null ? 1 : quantity;
    }

    public String getSymbol() {
        return symbol;
    }

    public OrderSide getSide() {
        return side;
    }

    public BigDecimal getTargetPrice() {
        return targetPrice;
    }

    public Integer getQuantity() {
        return quantity;
    }
}
