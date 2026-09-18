package com.tradingsystem.spring_boot_app.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;

/**
 * Configuration for DuckDB analytics warehouse datasource.
 * Separate from the main PostgreSQL datasource for operational data.
 * 
 * DataSource hierarchy:
 * - PostgreSQL (default/primary): For operational data reads
 * - DuckDB (warehouse): For analytics warehouse writes
 */
@Configuration
public class DuckDBConfig {
    
    public static final String WAREHOUSE_DATASOURCE_BEAN = "warehouseDataSource";
    public static final String WAREHOUSE_JDBC_TEMPLATE_BEAN = "warehouseJdbcTemplate";
    
    @Value("${warehouse.datasource.url:jdbc:duckdb:./warehouse.duckdb}")
    private String warehouseUrl;
    
    @Value("${warehouse.datasource.driver-class-name:org.duckdb.DuckDBDriver}")
    private String warehouseDriverClassName;
    
    /**
     * Create DuckDB datasource for warehouse.
     * Reads from warehouse.datasource.url and warehouse.datasource.driver-class-name in properties.
     */
    @Bean(name = WAREHOUSE_DATASOURCE_BEAN)
    public DataSource warehouseDataSource() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName(warehouseDriverClassName);
        dataSource.setUrl(warehouseUrl);
        return dataSource;
    }
    
    /**
     * Create JdbcTemplate for warehouse operations.
     */
    @Bean(name = WAREHOUSE_JDBC_TEMPLATE_BEAN)
    public JdbcTemplate warehouseJdbcTemplate(DataSource warehouseDataSource) {
        return new JdbcTemplate(warehouseDataSource);
    }
}
