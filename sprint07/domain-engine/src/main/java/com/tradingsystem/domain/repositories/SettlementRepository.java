package com.tradingsystem.domain.repositories;


import com.tradingsystem.domain.entities.Settlement;

import java.util.List;

public interface SettlementRepository {
    void save(String accountId, Settlement settlement);


    List<Settlement> findByAccountId(String accountId);
}
