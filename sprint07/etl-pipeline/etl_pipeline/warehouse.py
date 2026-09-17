import duckdb
import logging
from datetime import datetime
from .config import WAREHOUSE_PATH

logger = logging.getLogger(__name__)

class DuckDBWarehouse:
    def __init__(self):
        self.conn = None
    
    def connect(self):
        """Connect to DuckDB"""
        try:
            self.conn = duckdb.connect(WAREHOUSE_PATH)
            logger.info(f"Connected to DuckDB: {WAREHOUSE_PATH}")
            self.initialize_schema()
            return True
        except Exception as e:
            logger.error(f"Failed to connect to DuckDB: {e}")
            return False
    
    def close(self):
        """Close connection"""
        if self.conn:
            self.conn.close()
            logger.info("Disconnected from DuckDB")
    
    def initialize_schema(self):
        """Create warehouse tables if they don't exist"""
        try:
            # Watermark table
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS etl_watermark (
                    pipeline_name VARCHAR PRIMARY KEY,
                    last_processed_timestamp TIMESTAMP,
                    last_update_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    batch_id VARCHAR,
                    status VARCHAR DEFAULT 'ACTIVE'
                )
            """)
            
            # Date dimension
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS dim_date (
                    date_key BIGINT PRIMARY KEY,
                    full_date DATE UNIQUE,
                    year INTEGER, month INTEGER, day INTEGER, quarter INTEGER,
                    week_of_year INTEGER, day_of_week INTEGER,
                    day_name VARCHAR, month_name VARCHAR, is_weekend BOOLEAN
                )
            """)
            
            # Instrument dimension
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS dim_instrument (
                    instrument_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    instrument_id BIGINT UNIQUE NOT NULL,
                    ticker_symbol VARCHAR, instrument_name VARCHAR,
                    instrument_status VARCHAR,
                    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    effective_to TIMESTAMP, is_current BOOLEAN DEFAULT true
                )
            """)
            
            # Account dimension
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS dim_account (
                    account_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    account_id BIGINT UNIQUE NOT NULL,
                    account_num VARCHAR, user_id BIGINT, account_status VARCHAR,
                    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    effective_to TIMESTAMP, is_current BOOLEAN DEFAULT true
                )
            """)
            
            # Fact trades
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS fact_trades (
                    trade_key BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    order_id BIGINT UNIQUE NOT NULL,
                    date_key BIGINT NOT NULL,
                    instrument_key BIGINT NOT NULL,
                    account_key BIGINT NOT NULL,
                    side VARCHAR CHECK (side IN ('BUY', 'SELL')),
                    quantity DECIMAL(19, 4) NOT NULL CHECK (quantity > 0),
                    price DECIMAL(19, 4) NOT NULL CHECK (price > 0),
                    trade_value DECIMAL(19, 4) NOT NULL CHECK (trade_value > 0),
                    order_status VARCHAR, created_date_key BIGINT,
                    batch_id VARCHAR, loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Dead-letter table
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS etl_dlt_orders (
                    dlt_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                    order_id BIGINT, account_id BIGINT, instrument_id BIGINT,
                    side VARCHAR, quantity DECIMAL(19, 4), price DECIMAL(19, 4),
                    order_status VARCHAR, created_at TIMESTAMP,
                    failure_reason VARCHAR, batch_id VARCHAR,
                    original_data VARCHAR, dlt_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Batch summary
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS etl_batch_summary (
                    batch_id VARCHAR PRIMARY KEY,
                    pipeline_name VARCHAR, watermark_start TIMESTAMP,
                    watermark_end TIMESTAMP, records_processed INTEGER DEFAULT 0,
                    records_loaded INTEGER DEFAULT 0, records_rejected INTEGER DEFAULT 0,
                    status VARCHAR DEFAULT 'IN_PROGRESS', error_message VARCHAR,
                    start_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_timestamp TIMESTAMP
                )
            """)
            
            logger.info("DuckDB schema initialized successfully")
        except Exception as e:
            logger.error(f"Schema initialization error: {e}")
    
    def get_watermark(self):
        """Get last processed timestamp"""
        try:
            result = self.conn.execute(
                "SELECT last_processed_timestamp FROM etl_watermark WHERE pipeline_name = 'TRADES_ETL'"
            ).fetchall()
            if result:
                return result[0][0]
            return datetime.min
        except:
            return datetime.min
    
    def insert_dimension_data(self, table_name, data_dict):
        """Insert data into dimension tables"""
        try:
            columns = ', '.join(data_dict.keys())
            placeholders = ', '.join(['?' for _ in data_dict.keys()])
            query = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"
            self.conn.execute(query, list(data_dict.values()))
        except Exception as e:
            logger.warning(f"Insert error (may be duplicate): {e}")
    
    def insert_fact_trade(self, trade_data):
        """Insert trade fact (upsert via delete+insert)"""
        try:
            # Delete existing if present
            self.conn.execute("DELETE FROM fact_trades WHERE order_id = ?", (trade_data['order_id'],))
            
            # Insert
            columns = ', '.join(trade_data.keys())
            placeholders = ', '.join(['?' for _ in trade_data.keys()])
            query = f"INSERT INTO fact_trades ({columns}) VALUES ({placeholders})"
            self.conn.execute(query, list(trade_data.values()))
            return True
        except Exception as e:
            logger.error(f"Failed to insert fact trade: {e}")
            return False
    
    def insert_dead_letter(self, order_id, account_id, instrument_id, side, quantity, price, order_status, created_at, failure_reason, batch_id):
        """Insert rejected order to dead-letter table"""
        try:
            self.conn.execute("""
                INSERT INTO etl_dlt_orders 
                (order_id, account_id, instrument_id, side, quantity, price, order_status, created_at, failure_reason, batch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (order_id, account_id, instrument_id, side, quantity, price, order_status, created_at, failure_reason, batch_id))
        except Exception as e:
            logger.error(f"Failed to insert dead-letter: {e}")
    
    def update_watermark(self, timestamp, batch_id):
        """Update watermark after successful batch"""
        try:
            self.conn.execute("""
                DELETE FROM etl_watermark WHERE pipeline_name = 'TRADES_ETL'
            """)
            self.conn.execute("""
                INSERT INTO etl_watermark (pipeline_name, last_processed_timestamp, batch_id, status)
                VALUES (?, ?, ?, ?)
            """, ('TRADES_ETL', timestamp, batch_id, 'ACTIVE'))
        except Exception as e:
            logger.error(f"Failed to update watermark: {e}")
    
    def insert_batch_summary(self, batch_id, records_processed, records_loaded, records_rejected, status, error_msg=None):
        """Record batch execution summary"""
        try:
            self.conn.execute("""
                INSERT INTO etl_batch_summary 
                (batch_id, pipeline_name, records_processed, records_loaded, records_rejected, status, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (batch_id, 'TRADES_ETL', records_processed, records_loaded, records_rejected, status, error_msg))
        except Exception as e:
            logger.error(f"Failed to insert batch summary: {e}")
