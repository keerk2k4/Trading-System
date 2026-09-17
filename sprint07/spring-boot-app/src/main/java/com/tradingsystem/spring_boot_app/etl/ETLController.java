package com.tradingsystem.spring_boot_app.etl;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * REST API for ETL pipeline operations.
 * Allows manual execution of incremental loads.
 */
@RestController
@RequestMapping("/api/etl")
public class ETLController {
    
    private static final Logger logger = LoggerFactory.getLogger(ETLController.class);
    
    private final IncrementalTradesETLService etlService;
    
    public ETLController(IncrementalTradesETLService etlService) {
        this.etlService = etlService;
    }
    
    /**
     * Run one incremental load cycle.
     * 
     * Example: curl -X POST http://localhost:8080/api/etl/load-trades
     * 
     * @return Batch result with loaded/rejected counts
     */
    @PostMapping("/load-trades")
    public ResponseEntity<?> runIncrementalLoad() {
        try {
            logger.info("ETL load-trades endpoint called");
            IncrementalTradesETLService.BatchResult result = etlService.runIncrementalLoad();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("ETL load-trades failed: {}", e.getMessage(), e);
            
            // Extract root cause message for better debugging
            String errorMessage = e.getMessage();
            if (e.getCause() != null) {
                errorMessage = e.getCause().getMessage();
            }
            
            return ResponseEntity.internalServerError()
                .body(Map.of(
                    "error", e.getMessage(),
                    "cause", errorMessage,
                    "type", e.getClass().getSimpleName()
                ));
        }
    }
    
    /**
     * Health check for ETL service.
     */
    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of("status", "UP", "service", "ETL"));
    }
}
