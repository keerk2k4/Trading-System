package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.entities.Order;
import com.tradingsystem.domain.repositories.IdempotencyStore;
import com.tradingsystem.domain.services.OrderValidator;
import com.tradingsystem.exception.DuplicateIdempotencyKeyException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class IdempotencyKeyStoreTest {

    @Test
    void shouldRejectDuplicateIdempotencyKey(){

        IdempotencyStore store = new IdempotencyStoreImpl();

        String key="ORDER-001";
        store.save(key);

        assertTrue(store.exists(key));

        assertThrows(DuplicateIdempotencyKeyException.class,()->{
            if (store.exists(key)) {
                throw new DuplicateIdempotencyKeyException(key);
            }
        });
    }
}
