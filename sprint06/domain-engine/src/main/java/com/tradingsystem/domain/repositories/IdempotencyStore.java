package com.tradingsystem.domain.repositories;


public interface IdempotencyStore {

    boolean exists(String idempotencykey);

    void save(String idempotencykey);
}

