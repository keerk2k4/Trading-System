package com.tradeexecutor;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Trade Executor Application - Main entry point.
 * 
 * Responsible for order execution, applying fill rules, and coordinating
 * order processing through Kafka and PostgreSQL.
 * 
 * Enables scheduled tasks for the market-data poller.
 */
@EnableScheduling
@MapperScan("com.tradeexecutor.mapper")
@SpringBootApplication
public class TradeExecutorApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeExecutorApplication.class, args);
    }
}


