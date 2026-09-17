package com.tradingsystem.spring_boot_app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
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
@EnableConfigurationProperties(DuckDBConfig.DuckDBProperties.class)
public class DuckDBConfig {
    
    public static final String WAREHOUSE_DATASOURCE_BEAN = "warehouseDataSource";
    public static final String WAREHOUSE_JDBC_TEMPLATE_BEAN = "warehouseJdbcTemplate";
    
    /**
     * Create DuckDB datasource for warehouse.
     * Reads from warehouse.datasource.url and warehouse.datasource.driver-class-name in properties.
     */
    @Bean(name = WAREHOUSE_DATASOURCE_BEAN)
    public DataSource warehouseDataSource(
            org.springframework.boot.autoconfigure.jdbc.DataSourceProperties dataSourceProperties,
            DuckDBProperties duckDBProperties) {
        
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName(duckDBProperties.getDriverClassName());
        dataSource.setUrl(duckDBProperties.getUrl());
        // DuckDB doesn't use username/password, but set them if provided
        if (duckDBProperties.getUsername() != null) {
            dataSource.setUsername(duckDBProperties.getUsername());
        }
        if (duckDBProperties.getPassword() != null) {
            dataSource.setPassword(duckDBProperties.getPassword());
        }
        return dataSource;
    }
    
    /**
     * Create JdbcTemplate for warehouse operations.
     */
    @Bean(name = WAREHOUSE_JDBC_TEMPLATE_BEAN)
    public JdbcTemplate warehouseJdbcTemplate(DataSource warehouseDataSource) {
        return new JdbcTemplate(warehouseDataSource);
    }
    
    /**
     * Create primary JdbcTemplate for PostgreSQL operational database.
     * This is the default datasource for general queries.
     * Spring Boot auto-configures the primary datasource from spring.datasource.* properties.
     */
    @Bean
    public JdbcTemplate postgresJdbcTemplate(
            org.springframework.boot.autoconfigure.jdbc.DataSourceProperties dataSourceProperties) {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName(dataSourceProperties.getDriverClassName());
        dataSource.setUrl(dataSourceProperties.getUrl());
        if (dataSourceProperties.getUsername() != null) {
            dataSource.setUsername(dataSourceProperties.getUsername());
        }
        if (dataSourceProperties.getPassword() != null) {
            dataSource.setPassword(dataSourceProperties.getPassword());
        }
        return new JdbcTemplate(dataSource);
    }
    
    /**
     * Configuration properties for DuckDB datasource.
     */
    @ConfigurationProperties(prefix = "warehouse.datasource")
    public static class DuckDBProperties {
        private String url;
        private String driverClassName;
        private String username;
        private String password;
        
        public String getUrl() {
            return url;
        }
        
        public void setUrl(String url) {
            this.url = url;
        }
        
        public String getDriverClassName() {
            return driverClassName;
        }
        
        public void setDriverClassName(String driverClassName) {
            this.driverClassName = driverClassName;
        }
        
        public String getUsername() {
            return username;
        }
        
        public void setUsername(String username) {
            this.username = username;
        }
        
        public String getPassword() {
            return password;
        }
        
        public void setPassword(String password) {
            this.password = password;
        }
    }
}
