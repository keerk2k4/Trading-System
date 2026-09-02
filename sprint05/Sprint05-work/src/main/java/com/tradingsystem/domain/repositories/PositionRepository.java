package com.tradingsystem.domain.repositories;

import com.tradingsystem.domain.entities.Holding;
import com.tradingsystem.domain.entities.Position;

import java.util.List;

public interface PositionRepository {
    void save(String accountId, Position position);

    List<Position> findByAccountId(String accountId);
}
