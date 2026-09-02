
        package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.repositories.HoldingRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class InMemoryHoldingRepository implements HoldingRepository {

    private final Map<String, List<Holding>> holdings = new HashMap<>();

    @Override
    public void save(String accountId, Holding holding) {

        Optional<Holding> existingHolding =
                findByAccountIdAndInstrument(
                        accountId,
                        holding.getInstrument()
                );

        if (existingHolding.isEmpty()) {
            holdings
                    .computeIfAbsent(accountId, id -> new ArrayList<>())
                    .add(holding);
        }
    }

    @Override
    public List<Holding> findByAccountId(String accountId) {
        return holdings.getOrDefault(accountId, List.of());
    }

    @Override
    public Optional<Holding> findByAccountIdAndInstrument(
            String accountId,
            Instrument instrument
    ) {
        return findByAccountId(accountId)
                .stream()
                .filter(holding ->
                        holding.getInstrument() == instrument
                )
                .findFirst();
    }
}
