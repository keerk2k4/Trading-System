package com.tradingsystem.domain.repositories.impl;


import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.repositories.PositionRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class InMemoryPositionRepository implements PositionRepository {
    private final Map<String, List<Position>> holdings = new HashMap<>();

    @Override
    public void save(String accountId, Position position) {
        holdings
                .computeIfAbsent(accountId, id -> new ArrayList<>())
                .add(position);
    }

    @Override
    public List<Position> findByAccountId(String accountId) {
        return holdings.getOrDefault(accountId, List.of());
    }
}
