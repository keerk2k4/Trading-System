package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

class UserTest {
    private User user;
    private final LocalDateTime now = LocalDateTime.now();

    @BeforeEach
    void setUp() {
        user = new User(
                1L,
                "John",
                "Doe",
                "john.doe@example.com",
                "9876543210",
                "hashedpassword",
                UserStatus.ACTIVE,
                now,
                now);
    }

    @Test
    void shouldStoreUserId() {
        assertEquals(1L, user.getUserId());
    }

    @Test
    void shouldStoreFirstName() {
        assertEquals("John", user.getFirstName());
    }

    @Test
    void shouldStoreLastName() {
        assertEquals("Doe", user.getLastName());
    }

    @Test
    void shouldStoreEmail() {
        assertEquals("john.doe@example.com", user.getEmail());
    }

    @Test
    void shouldStorePhone() {
        assertEquals("9876543210", user.getPhone());
    }

    @Test
    void shouldStorePasswordHash() {
        assertEquals("hashedpassword", user.getPasswordHash());
    }

    @Test
    void shouldStoreStatus() {
        assertEquals(UserStatus.ACTIVE, user.getStatus());
    }

    @Test
    void shouldStoreTimestamps() {
        assertEquals(now, user.getCreatedAt());
        assertEquals(now, user.getUpdatedAt());
    }
}
