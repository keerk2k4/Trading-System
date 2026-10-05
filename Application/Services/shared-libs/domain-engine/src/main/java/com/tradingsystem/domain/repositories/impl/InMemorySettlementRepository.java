package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.entities.Settlement;
import com.tradingsystem.domain.repositories.SettlementRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class InMemorySettlementRepository implements SettlementRepository {
    private final Map<String, List<Settlement>> holdings = new HashMap<>();

    @Override
    public void save(String accountId, Settlement settlement) {
        holdings
                .computeIfAbsent(accountId, id -> new ArrayList<>())
                .add(settlement);
    }

    @Override
    public List<Settlement> findByAccountId(String accountId) {
        return holdings.getOrDefault(accountId, List.of());
    }
}

