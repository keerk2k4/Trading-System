package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.repositories.HoldingRepository;

import java.util.*;

public class InMemoryHoldingRepository implements HoldingRepository {

    private final Map<String, List<Holding>> holdings = new HashMap<>();

    @Override
    public void save(String accountId, Holding holding) {
        holdings
                .computeIfAbsent(accountId, id -> new ArrayList<>())
                .add(holding);
    }

    @Override
    public List<Holding> findByAccountId(String accountId) {
        return holdings.getOrDefault(accountId, List.of());
    }
}