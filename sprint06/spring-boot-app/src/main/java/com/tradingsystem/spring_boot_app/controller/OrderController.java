package com.tradingsystem.spring_boot_app.controller;

import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.UserStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderController {

    @GetMapping("/dummy")
    public ResponseEntity<User> getDummyUser() {
        User u = new User(1L, "John", "Doe", "john@gmail.com", "9882732832", "password", UserStatus.ACTIVE);
        return ResponseEntity.ok(u);
    }
}
