-- migrations/006_warehouse_schema.sql
-- Analytics warehouse schema for FACT_TRADES and dimensions
-- Supports incremental loading with watermark-based updates

BEGIN;

-- ============================================================
-- WATERMARK TRACKING
-- ============================================================
-- Tracks the last successfully processed order creation timestamp
-- for incremental loads. Prevents duplicate processing and data loss.
-- ============================================================

CREATE TABLE IF NOT EXISTS etl_watermark (
    watermark_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    pipeline_name VARCHAR(100) NOT NULL UNIQUE,
    
    last_processed_timestamp TIMESTAMP,
    
    last_update_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    batch_id VARCHAR(100),
    
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    
    CONSTRAINT chk_watermark_status
        CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED'))
);

CREATE INDEX IF NOT EXISTS idx_etl_watermark_pipeline ON etl_watermark(pipeline_name);


-- ============================================================
-- DIM_DATE
-- ============================================================
-- Date dimension covering all dates in order data range.
-- Supports time-based analytics and aggregations.
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_date (
    date_key BIGINT PRIMARY KEY,
    
    full_date DATE NOT NULL UNIQUE,
    
    year SMALLINT NOT NULL,
    
    month SMALLINT NOT NULL,
    
    day SMALLINT NOT NULL,
    
    quarter SMALLINT NOT NULL,
    
    week_of_year SMALLINT NOT NULL,
    
    day_of_week SMALLINT NOT NULL,
    
    day_name VARCHAR(10),
    
    month_name VARCHAR(10),
    
    is_weekend BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_dim_date_month
        CHECK (month BETWEEN 1 AND 12),
    
    CONSTRAINT chk_dim_date_day
        CHECK (day BETWEEN 1 AND 31),
    
    CONSTRAINT chk_dim_date_quarter
        CHECK (quarter BETWEEN 1 AND 4),
    
    CONSTRAINT chk_dim_date_week
        CHECK (week_of_year BETWEEN 1 AND 53),
    
    CONSTRAINT chk_dim_date_dow
        CHECK (day_of_week BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_dim_date_full_date ON dim_date(full_date);


-- ============================================================
-- DIM_INSTRUMENT
-- ============================================================
-- Instrument dimension referencing instruments table.
-- Surrogate key for fact table joins.
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_instrument (
    instrument_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    instrument_id BIGINT NOT NULL UNIQUE,
    
    ticker_symbol VARCHAR(20) NOT NULL,
    
    instrument_name VARCHAR(150) NOT NULL,
    
    instrument_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    
    effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    effective_to TIMESTAMP,
    
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    
    CONSTRAINT fk_dim_instrument_source
        FOREIGN KEY (instrument_id)
        REFERENCES instruments(instrument_id),
    
    CONSTRAINT chk_dim_instrument_status
        CHECK (instrument_status IN ('ACTIVE', 'HALTED', 'DELISTED'))
);

CREATE INDEX IF NOT EXISTS idx_dim_instrument_instrument_id ON dim_instrument(instrument_id);
CREATE INDEX IF NOT EXISTS idx_dim_instrument_ticker ON dim_instrument(ticker_symbol);
CREATE INDEX IF NOT EXISTS idx_dim_instrument_current ON dim_instrument(is_current);


-- ============================================================
-- DIM_ACCOUNT
-- ============================================================
-- Account dimension referencing trading_accounts table.
-- Surrogate key for fact table joins.
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_account (
    account_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    account_id BIGINT NOT NULL UNIQUE,
    
    account_num VARCHAR(50) NOT NULL,
    
    user_id BIGINT NOT NULL,
    
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    
    effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    effective_to TIMESTAMP,
    
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    
    CONSTRAINT fk_dim_account_source
        FOREIGN KEY (account_id)
        REFERENCES trading_accounts(account_id),
    
    CONSTRAINT chk_dim_account_status
        CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_dim_account_account_id ON dim_account(account_id);
CREATE INDEX IF NOT EXISTS idx_dim_account_account_num ON dim_account(account_num);
CREATE INDEX IF NOT EXISTS idx_dim_account_current ON dim_account(is_current);


-- ============================================================
-- FACT_TRADES
-- ============================================================
-- Core fact table storing trade/order events for analytics.
-- Unique constraint on (order_id) ensures no duplicates on re-run.
-- Supports incremental loading with MERGE semantics.
-- ============================================================

CREATE TABLE IF NOT EXISTS fact_trades (
    trade_key BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    order_id BIGINT NOT NULL UNIQUE,
    
    date_key BIGINT NOT NULL,
    
    instrument_key BIGINT NOT NULL,
    
    account_key BIGINT NOT NULL,
    
    side VARCHAR(10) NOT NULL,
    
    quantity NUMERIC(18,4) NOT NULL,
    
    price NUMERIC(18,4) NOT NULL,
    
    trade_value NUMERIC(18,4) NOT NULL,
    
    order_status VARCHAR(20) NOT NULL,
    
    created_date_key BIGINT NOT NULL,
    
    batch_id VARCHAR(100) NOT NULL,
    
    loaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_fact_trades_date
        FOREIGN KEY (date_key)
        REFERENCES dim_date(date_key),
    
    CONSTRAINT fk_fact_trades_instrument
        FOREIGN KEY (instrument_key)
        REFERENCES dim_instrument(instrument_key),
    
    CONSTRAINT fk_fact_trades_account
        FOREIGN KEY (account_key)
        REFERENCES dim_account(account_key),
    
    CONSTRAINT fk_fact_trades_created_date
        FOREIGN KEY (created_date_key)
        REFERENCES dim_date(date_key),
    
    CONSTRAINT chk_fact_trades_side
        CHECK (side IN ('BUY', 'SELL')),
    
    CONSTRAINT chk_fact_trades_quantity
        CHECK (quantity > 0),
    
    CONSTRAINT chk_fact_trades_price
        CHECK (price > 0),
    
    CONSTRAINT chk_fact_trades_trade_value
        CHECK (trade_value > 0),
    
    CONSTRAINT chk_fact_trades_status
        CHECK (order_status IN ('PENDING', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_fact_trades_date_key ON fact_trades(date_key);
CREATE INDEX IF NOT EXISTS idx_fact_trades_instrument_key ON fact_trades(instrument_key);
CREATE INDEX IF NOT EXISTS idx_fact_trades_account_key ON fact_trades(account_key);
CREATE INDEX IF NOT EXISTS idx_fact_trades_order_status ON fact_trades(order_status);
CREATE INDEX IF NOT EXISTS idx_fact_trades_batch_id ON fact_trades(batch_id);


-- ============================================================
-- ETL_DLT_ORDERS (Dead-Letter Table)
-- ============================================================
-- Stores rejected orders that fail data quality checks.
-- Includes original data, failure reason, and batch identifier
-- for investigation and reprocessing.
-- ============================================================

CREATE TABLE IF NOT EXISTS etl_dlt_orders (
    dlt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    order_id BIGINT,
    
    account_id BIGINT,
    
    instrument_id BIGINT,
    
    side VARCHAR(10),
    
    quantity NUMERIC(18,4),
    
    price NUMERIC(18,4),
    
    order_status VARCHAR(20),
    
    created_at TIMESTAMP,
    
    failure_reason VARCHAR(500) NOT NULL,
    
    batch_id VARCHAR(100) NOT NULL,
    
    dlt_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    original_data TEXT,
    
    CONSTRAINT chk_dlt_reason_not_empty
        CHECK (failure_reason <> '')
);

CREATE INDEX IF NOT EXISTS idx_etl_dlt_orders_batch_id ON etl_dlt_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_etl_dlt_orders_created_at ON etl_dlt_orders(dlt_created_at);
CREATE INDEX IF NOT EXISTS idx_etl_dlt_orders_order_id ON etl_dlt_orders(order_id);


-- ============================================================
-- ETL_BATCH_SUMMARY
-- ============================================================
-- Tracks each ETL batch execution for audit and debugging.
-- ============================================================

CREATE TABLE IF NOT EXISTS etl_batch_summary (
    batch_id VARCHAR(100) PRIMARY KEY,
    
    pipeline_name VARCHAR(100) NOT NULL,
    
    start_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    end_timestamp TIMESTAMP,
    
    watermark_start TIMESTAMP,
    
    watermark_end TIMESTAMP,
    
    records_processed INT NOT NULL DEFAULT 0,
    
    records_loaded INT NOT NULL DEFAULT 0,
    
    records_rejected INT NOT NULL DEFAULT 0,
    
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    
    error_message TEXT,
    
    CONSTRAINT chk_batch_status
        CHECK (status IN ('IN_PROGRESS', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_etl_batch_summary_pipeline ON etl_batch_summary(pipeline_name);
CREATE INDEX IF NOT EXISTS idx_etl_batch_summary_status ON etl_batch_summary(status);


COMMIT;
