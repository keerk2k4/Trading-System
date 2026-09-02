package com.tradingsystem.domain.repositories;

import com.tradingsystem.domain.entities.Order;

public interface IdempotencyStore {

    boolean exists(String idempotencykey);

    void save(String idempotencykey);
}

