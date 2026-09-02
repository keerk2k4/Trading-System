
        package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.ProductType;
import com.tradingsystem.domain.repositories.PositionRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class InMemoryPositionRepository implements PositionRepository {

    private final Map<String, List<Position>> positions = new HashMap<>();

    @Override
    public void save(String accountId, Position position) {

        Optional<Position> existingPosition =
                findByAccountIdAndInstrumentAndProductType(
                        accountId,
                        position.getInstrument(),
                        position.getProductType()
                );

        if (existingPosition.isEmpty()) {
            positions
                    .computeIfAbsent(accountId, id -> new ArrayList<>())
                    .add(position);
        }
    }

    @Override
    public List<Position> findByAccountId(String accountId) {
        return positions.getOrDefault(accountId, List.of());
    }

    @Override
    public Optional<Position> findByAccountIdAndInstrumentAndProductType(
            String accountId,
            Instrument instrument,
            ProductType productType
    ) {
        return findByAccountId(accountId)
                .stream()
                .filter(position ->
                        position.getInstrument() == instrument
                                && position.getProductType() == productType
                )
                .findFirst();
    }

    @Override
    public void delete(
            String accountId,
            Instrument instrument,
            ProductType productType
    ) {
        List<Position> accountPositions = positions.get(accountId);

        if (accountPositions == null) {
            return;
        }

        accountPositions.removeIf(position ->
                position.getInstrument() == instrument
                        && position.getProductType() == productType
        );
    }
}

