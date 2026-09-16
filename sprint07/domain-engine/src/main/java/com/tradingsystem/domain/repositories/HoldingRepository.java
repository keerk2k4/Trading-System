
        package com.tradingsystem.domain.repositories;

import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Instrument;

import java.util.List;
import java.util.Optional;

public interface HoldingRepository {

    void save(String accountId, Holding holding);

    List<Holding> findByAccountId(String accountId);

    Optional<Holding> findByAccountIdAndInstrument(
            String accountId,
            Instrument instrument
    );
}

