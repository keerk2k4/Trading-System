package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderSide;
import com.tradingsystem.domain.enums.OrderType;
import com.tradingsystem.exception.InvalidOrderArgumentException;
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
 * The effective account always comes from the JWT token, never from the body:
 * {@code accountId} is accepted (the contract requires it and the UI sends it)
 * but ignored, exactly like every other caller-supplied account identifier.
 */
public class CreateOrderRequest {

    private final Long accountId;

    @NotNull
    private final OrderType orderType;

    @NotNull
    @Size(min = 1, max = 20)
    private final String symbol;

    @NotNull
    private final OrderSide side;

    @NotNull
    @Min(1)
    private final Integer quantity;

    @DecimalMin(value = "0.01")
    @Digits(integer = 17, fraction = 2)
    private final BigDecimal price;

    @NotNull
    @Size(min = 8, max = 100)
    private final String idempotencyKey;

    @JsonCreator
    public CreateOrderRequest(
            @JsonProperty("accountId") Long accountId,
            @JsonProperty("orderType") OrderType orderType,
            @JsonProperty("symbol") String symbol,
            @JsonProperty("side") OrderSide side,
            @JsonProperty("quantity") Integer quantity,
            @JsonProperty("price") BigDecimal price,
            @JsonProperty("idempotencyKey") String idempotencyKey
    ) {
        this.accountId = accountId;
        this.orderType = orderType == null ? OrderType.LIMIT : orderType;
        this.symbol = symbol;
        this.side = side;
        this.quantity = quantity;
        this.price = price;
        this.idempotencyKey = idempotencyKey;
    }

    public void validateForCreate() {
        if (orderType == OrderType.MARKET) {
            if (price != null) {
                throw new InvalidOrderArgumentException("price", String.valueOf(price));
            }
            return;
        }

        if (price == null
                || price.compareTo(new BigDecimal("0.01")) < 0
                || price.precision() - price.scale() > 17
                || price.scale() > 2) {
            throw new InvalidOrderArgumentException("Price", String.valueOf(price));
        }
    }

    public OrderType getOrderType() {
        return orderType;
    }

    /**
     * The body-supplied account id, if any. Informational only: order placement
     * always uses the JWT {@code accountId} claim (see {@code OrderController}).
     */
    public Long getAccountId() {
        return accountId;
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
