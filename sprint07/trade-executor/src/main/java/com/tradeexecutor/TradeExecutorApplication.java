package com.tradeexecutor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Trade Executor Application - Main entry point.
 * 
 * Responsible for order execution, applying fill rules, and coordinating
 * order processing through Kafka and PostgreSQL.
 */
@SpringBootApplication
public class TradeExecutorApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeExecutorApplication.class, args);
    }
}

