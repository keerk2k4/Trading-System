-- DuckDB Analytics Warehouse Schema
-- Designed for incremental loading of trade data with dimensions
-- All timestamps use DuckDB native TIMESTAMP type
-- Idempotence achieved via DELETE+INSERT pattern

-- Watermark table: tracks last processed order creation timestamp
CREATE TABLE IF NOT EXISTS etl_watermark (
    pipeline_name VARCHAR(100) PRIMARY KEY,
    last_processed_timestamp TIMESTAMP,
    last_update_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- Date dimension: one row per date
CREATE TABLE IF NOT EXISTS dim_date (
    date_key BIGINT PRIMARY KEY,  -- YYYYMMDD format
    full_date DATE UNIQUE,
    year INTEGER,
    month INTEGER,
    day INTEGER,
    quarter INTEGER,
    week_of_year INTEGER,
    day_of_week INTEGER,
    day_name VARCHAR(20),
    month_name VARCHAR(20),
    is_weekend BOOLEAN
);

-- Instrument dimension with surrogate key
CREATE TABLE IF NOT EXISTS dim_instrument (
    instrument_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    instrument_id BIGINT UNIQUE NOT NULL,
    ticker_symbol VARCHAR(20),
    instrument_name VARCHAR(255),
    instrument_status VARCHAR(50),
    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMP,
    is_current BOOLEAN DEFAULT true
);

-- Account dimension with surrogate key
CREATE TABLE IF NOT EXISTS dim_account (
    account_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    account_id BIGINT UNIQUE NOT NULL,
    account_num VARCHAR(50),
    user_id BIGINT,
    account_status VARCHAR(50),
    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMP,
    is_current BOOLEAN DEFAULT true
);

-- Fact table: trades (orders in any final state)
CREATE TABLE IF NOT EXISTS fact_trades (
    trade_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id BIGINT UNIQUE NOT NULL,  -- Natural key, enforces idempotence
    date_key BIGINT NOT NULL,
    instrument_key BIGINT NOT NULL,
    account_key BIGINT NOT NULL,
    side VARCHAR(10) CHECK (side IN ('BUY', 'SELL')),
    quantity DECIMAL(19, 4) NOT NULL CHECK (quantity > 0),
    price DECIMAL(19, 4) NOT NULL CHECK (price > 0),
    trade_value DECIMAL(19, 4) NOT NULL CHECK (trade_value > 0),
    order_status VARCHAR(50),
    created_date_key BIGINT,
    batch_id VARCHAR(100),
    loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (date_key) REFERENCES dim_date(date_key),
    FOREIGN KEY (instrument_key) REFERENCES dim_instrument(instrument_key),
    FOREIGN KEY (account_key) REFERENCES dim_account(account_key)
);

-- Dead-letter table: orders that failed validation
CREATE TABLE IF NOT EXISTS etl_dlt_orders (
    dlt_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id BIGINT NOT NULL,
    account_id BIGINT,
    instrument_id BIGINT,
    side VARCHAR(10),
    quantity DECIMAL(19, 4),
    price DECIMAL(19, 4),
    order_status VARCHAR(50),
    created_at TIMESTAMP,
    failure_reason VARCHAR(500) NOT NULL,
    batch_id VARCHAR(100) NOT NULL,
    original_data VARCHAR(1000),
    dlt_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Batch summary: audit trail for each ETL run
CREATE TABLE IF NOT EXISTS etl_batch_summary (
    batch_id VARCHAR(100) PRIMARY KEY,
    pipeline_name VARCHAR(100) NOT NULL,
    watermark_start TIMESTAMP,
    watermark_end TIMESTAMP,
    records_processed INTEGER DEFAULT 0,
    records_loaded INTEGER DEFAULT 0,
    records_rejected INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS, SUCCESS, PARTIAL_SUCCESS, FAILED
    error_message VARCHAR(500),
    start_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_timestamp TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fact_trades_order_id ON fact_trades(order_id);
CREATE INDEX IF NOT EXISTS idx_fact_trades_account_key ON fact_trades(account_key);
CREATE INDEX IF NOT EXISTS idx_fact_trades_instrument_key ON fact_trades(instrument_key);
CREATE INDEX IF NOT EXISTS idx_fact_trades_date_key ON fact_trades(date_key);
CREATE INDEX IF NOT EXISTS idx_dim_instrument_id ON dim_instrument(instrument_id);
CREATE INDEX IF NOT EXISTS idx_dim_account_id ON dim_account(account_id);
CREATE INDEX IF NOT EXISTS idx_dlt_orders_batch_id ON etl_dlt_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_watermark_pipeline ON etl_watermark(pipeline_name);
