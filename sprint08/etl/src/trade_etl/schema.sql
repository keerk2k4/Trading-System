CREATE SEQUENCE IF NOT EXISTS fact_trades_key_seq;
CREATE SEQUENCE IF NOT EXISTS fact_trades_dead_letter_key_seq;

CREATE TABLE IF NOT EXISTS dim_date (
    date_key INTEGER PRIMARY KEY,
    calendar_date DATE NOT NULL UNIQUE,
    day_of_month INTEGER NOT NULL,
    month_number INTEGER NOT NULL,
    quarter_number INTEGER NOT NULL,
    year_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_instrument (
    instrument_key BIGINT PRIMARY KEY,
    symbol VARCHAR NOT NULL UNIQUE,
    display_name VARCHAR NOT NULL,
    asset_class VARCHAR,
    quotation_currency VARCHAR(3),
    source_instrument_id BIGINT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS dim_account (
    account_key BIGINT PRIMARY KEY,
    account_number VARCHAR NOT NULL UNIQUE,
    account_status VARCHAR NOT NULL,
    source_account_id BIGINT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS fact_trades (
    trade_key BIGINT PRIMARY KEY DEFAULT nextval('fact_trades_key_seq'),
    source_order_id BIGINT NOT NULL UNIQUE,
    date_key INTEGER NOT NULL REFERENCES dim_date(date_key),
    instrument_key BIGINT NOT NULL REFERENCES dim_instrument(instrument_key),
    account_key BIGINT NOT NULL REFERENCES dim_account(account_key),
    side VARCHAR(4) NOT NULL,
    status VARCHAR(12) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    quantity DECIMAL(18,4) NOT NULL,
    price DECIMAL(18,4) NOT NULL,
    trade_value DECIMAL(22,4) NOT NULL,
    order_created_at TIMESTAMP NOT NULL,
    loaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS etl_watermark (
    pipeline_name VARCHAR PRIMARY KEY,
    last_created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_trades_dead_letter (
    dead_letter_key BIGINT PRIMARY KEY DEFAULT nextval('fact_trades_dead_letter_key_seq'),
    batch_id UUID NOT NULL,
    source_order_id BIGINT,
    reason VARCHAR NOT NULL,
    raw_row JSON NOT NULL,
    dead_lettered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (batch_id, source_order_id, reason)
);
