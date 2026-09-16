package com.tradingsystem.domain.repositories;

import com.tradingsystem.domain.entities.Instrument;
import com.tradingsystem.domain.entities.Position;
import com.tradingsystem.domain.enums.ProductType;

import java.util.List;
import java.util.Optional;

public interface PositionRepository {

    void save(String accountId, Position position);

    List<Position> findByAccountId(String accountId);

    Optional<Position> findByAccountIdAndInstrumentAndProductType(
            String accountId,
            Instrument instrument,
            ProductType productType
    );

    void delete(
            String accountId,
            Instrument instrument,
            ProductType productType
    );
}