package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * REST API request body for placing an order.
 * The accountId is extracted from the JWT token, not from the request body.
 */
public class CreateOrderRequest {

    @NotNull
    @Size(min = 1, max = 20)
    private final String symbol;

    @NotNull
    private final OrderSide side;

    @NotNull
    @Min(1)
    private final Integer quantity;

    @NotNull
    @DecimalMin(value = "0.01")
    @Digits(integer = 17, fraction = 2)
    private final BigDecimal price;

    @NotNull
    @Size(min = 8, max = 100)
    private final String idempotencyKey;

    @JsonCreator
    public CreateOrderRequest(
            @JsonProperty("symbol") String symbol,
            @JsonProperty("side") OrderSide side,
            @JsonProperty("quantity") Integer quantity,
            @JsonProperty("price") BigDecimal price,
            @JsonProperty("idempotencyKey") String idempotencyKey
    ) {
        this.symbol = symbol;
        this.side = side;
        this.quantity = quantity;
        this.price = price;
        this.idempotencyKey = idempotencyKey;
    }

    public String getSymbol() {
        return symbol;
    }

    public OrderSide getSide() {
        return side;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }
}
