package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.UserStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public class User {

    private final Long userId;

    @NotBlank
    @Size(max = 100)
    private final String firstName;

    @NotBlank
    @Size(max = 100)
    private final String lastName;

    @NotBlank
    @Email
    @Size(max = 255)
    private final String email;

    @Size(max = 20)
    private final String phone;

    @NotBlank
    @Size(max = 255)
    private final String passwordHash;

    @NotNull
    private UserStatus status;

    public User(
            Long userId,
            String firstName,
            String lastName,
            String email,
            String phone,
            String passwordHash,
            UserStatus status) {
        this.userId = userId;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phone = phone;
        this.passwordHash = passwordHash;
        this.status = status;
    }

    public Long getUserId() {
        return userId;
    }
    public String getFirstName() {
        return firstName;
    }
    public String getLastName() {
        return lastName;
    }
    public String getEmail() {
        return email;
    }
    public String getPhone() {
        return phone;
    }
    public String getPasswordHash() {
        return passwordHash;
    }
    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }
}