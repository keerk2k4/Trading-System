package com.tradingsystem.spring_boot_app.dto;

import com.tradingsystem.domain.enums.OrderType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;

import java.math.BigDecimal;

/**
 * PATCH /api/v1/orders/{id} body. At least one field must be present.
 * Price updates apply to LIMIT orders only (contract UpdateOrderRequest).
 */
public class UpdateOrderRequest {

    @Min(1)
    private Integer quantity;

    @DecimalMin(value = "0.01")
    @Digits(integer = 17, fraction = 2)
    private BigDecimal price;

    public UpdateOrderRequest() {
    }

    public UpdateOrderRequest(Integer quantity, BigDecimal price) {
        this.quantity = quantity;
        this.price = price;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public void validateForUpdate(OrderType orderType) {
        if (quantity == null && price == null) {
            throw new com.tradingsystem.exception.InvalidOrderArgumentException("Update", "empty");
        }
        if (quantity != null && quantity < 1) {
            throw new com.tradingsystem.exception.InvalidOrderArgumentException("Quantity", String.valueOf(quantity));
        }
        if (price != null) {
            if (orderType == OrderType.MARKET) {
                throw new com.tradingsystem.exception.InvalidOrderArgumentException("Price", String.valueOf(price));
            }
            if (price.compareTo(new BigDecimal("0.01")) < 0
                    || price.precision() - price.scale() > 17
                    || price.scale() > 2) {
                throw new com.tradingsystem.exception.InvalidOrderArgumentException("Price", String.valueOf(price));
            }
        }
    }
}
