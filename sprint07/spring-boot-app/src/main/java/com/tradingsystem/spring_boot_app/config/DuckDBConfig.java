package com.tradingsystem.spring_boot_app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * Configuration for DuckDB warehouse datasource.
 * 
 * This bean provides a separate JDBC connection to DuckDB for analytical queries.
 * PostgreSQL is used for operational data, while DuckDB serves as the warehouse.
 * 
 * Properties:
 * - warehouse.datasource.url: JDBC URL for DuckDB file (default: jdbc:duckdb:./warehouse.duckdb)
 * - warehouse.datasource.driver-class-name: DuckDB driver (org.duckdb.DuckDBDriver)
 * - warehouse.datasource.username: (optional, defaults to empty)
 * - warehouse.datasource.password: (optional, defaults to empty)
 */
@Configuration
@EnableConfigurationProperties(WarehouseDataSourceProperties.class)
public class DuckDBConfig {

    @Bean(name = "warehouseDataSource")
    public DataSource warehouseDataSource(WarehouseDataSourceProperties props) {
        return DataSourceBuilder.create()
                .driverClassName(props.getDriverClassName())
                .url(props.getUrl())
                .username(props.getUsername() == null ? "" : props.getUsername())
                .password(props.getPassword() == null ? "" : props.getPassword())
                .build();
    }

    @Bean(name = "warehouseJdbcTemplate")
    public JdbcTemplate warehouseJdbcTemplate(DataSource warehouseDataSource) {
        return new JdbcTemplate(warehouseDataSource);
    }
}

/**
 * Configuration properties for DuckDB warehouse datasource.
 * Bind properties with prefix "warehouse.datasource" from application.properties
 */
@ConfigurationProperties(prefix = "warehouse.datasource")
class WarehouseDataSourceProperties {
    private String url;
    private String driverClassName;
    private String username;
    private String password;

    // Getters and Setters
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
