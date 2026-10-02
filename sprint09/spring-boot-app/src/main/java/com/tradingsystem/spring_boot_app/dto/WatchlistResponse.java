package com.tradingsystem.spring_boot_app.dto;

import java.util.List;

public record WatchlistResponse(Long id, String name, boolean isDefault, List<String> symbols) {
}
