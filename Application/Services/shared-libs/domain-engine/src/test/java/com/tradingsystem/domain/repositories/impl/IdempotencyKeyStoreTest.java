package com.tradingsystem.domain.repositories.impl;

import com.tradingsystem.domain.repositories.IdempotencyStore;
import com.tradingsystem.exception.DuplicateOrderException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class IdempotencyKeyStoreTest {

    @Test
    void shouldRejectDuplicateIdempotencyKey(){

        IdempotencyStore store = new IdempotencyStoreImpl();

        String key="ORDER-001";
        store.save(key);

        assertTrue(store.exists(key));

        assertThrows(DuplicateOrderException.class,()->{
            if (store.exists(key)) {
                throw new DuplicateOrderException(key);
            }
        });
    }
}
