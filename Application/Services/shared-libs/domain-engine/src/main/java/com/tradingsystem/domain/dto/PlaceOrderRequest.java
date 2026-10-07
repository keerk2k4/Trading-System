package com.tradingsystem.domain.dto;


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


public class PlaceOrderRequest {


    @NotNull
    @Min(1)
    private final Long accountId;


    @NotNull
    @Size(min = 1, max = 20)
    private final String symbol;


    @NotNull
    private final OrderSide side;


    @NotNull
    private final OrderType orderType;


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



    public PlaceOrderRequest(
            @JsonProperty("accountId") Long accountId,
            @JsonProperty("orderType") OrderType orderType,
            @JsonProperty("symbol") String symbol,
            @JsonProperty("side") OrderSide side,
            @JsonProperty("quantity") Integer quantity,
            @JsonProperty("price") BigDecimal price,
            @JsonProperty("idempotencyKey") String idempotencyKey
    ) {

        if (accountId == null || accountId < 1) {
            throw new InvalidOrderArgumentException("Account ID");
        }

        if (symbol == null || symbol.isEmpty() || symbol.length() > 20) {
            throw new InvalidOrderArgumentException("Symbol");
        }

        if (side == null) {
            throw new InvalidOrderArgumentException("Side");
        }

        if (orderType == null) {
            throw new InvalidOrderArgumentException("Order Type");
        }

        if (quantity == null || quantity < 1) {
            throw new InvalidOrderArgumentException("Quantity");
        }

        if (orderType == OrderType.MARKET) {
            if (price != null) {
                throw new InvalidOrderArgumentException("Price", String.valueOf(price));
            }
        } else {
            if (price == null
                    || price.compareTo(new BigDecimal("0.01")) < 0
                    || price.precision() - price.scale() > 17
                    || price.scale() > 2) {
                throw new InvalidOrderArgumentException("Price", String.valueOf(price));
            }
        }

        if (idempotencyKey == null
                || idempotencyKey.length() < 8
                || idempotencyKey.length() > 100) {
            throw new InvalidOrderArgumentException("idempotencyKey");
        }

        this.accountId = accountId;
        this.orderType = orderType;
        this.symbol = symbol;
        this.side = side;
        this.quantity = quantity;
        this.price = price;
        this.idempotencyKey = idempotencyKey;
    }


    @JsonCreator
    public PlaceOrderRequest(
            @JsonProperty("accountId") Long accountId,
            @JsonProperty("symbol") String symbol,
            @JsonProperty("side") OrderSide side,
            @JsonProperty("quantity") Integer quantity,
            @JsonProperty("price") BigDecimal price,
            @JsonProperty("idempotencyKey") String idempotencyKey
    ) {
        this(accountId, OrderType.LIMIT, symbol, side, quantity, price, idempotencyKey);
    }


    public Long getAccountId() {
        return accountId;
    }


    public String getSymbol() {
        return symbol;
    }


    public OrderSide getSide() {
        return side;
    }


    public OrderType getOrderType() {
        return orderType;
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