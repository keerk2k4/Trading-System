package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.repositories.IdempotencyStore;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class IdempotencyStoreImpl implements IdempotencyStore {

    private final Set<String> keys = ConcurrentHashMap.newKeySet();

    @Override
    public boolean exists(String idempotencykey) {
        return keys.contains(idempotencykey);
    }

    @Override
    public void save(String idempotencykey) {
        keys.add(idempotencykey);
    }
}
