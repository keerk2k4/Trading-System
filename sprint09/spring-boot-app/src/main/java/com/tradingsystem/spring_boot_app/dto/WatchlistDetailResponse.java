package com.tradingsystem.spring_boot_app.dto;

import java.util.List;

public record WatchlistDetailResponse(Long id, String name, boolean isDefault,
                                      List<WatchlistStockResponse> stocks) {
}
