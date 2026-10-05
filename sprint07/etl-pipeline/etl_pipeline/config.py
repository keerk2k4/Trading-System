import os
from dotenv import load_dotenv

load_dotenv()

# PostgreSQL (Source - Operational Database)
POSTGRES_HOST = os.getenv('DB_HOST', '10.8.66.137')
POSTGRES_PORT = int(os.getenv('DB_PORT', '5432'))
POSTGRES_DB = os.getenv('DB_NAME', 'trading_system')
POSTGRES_USER = os.getenv('DB_USERNAME', 'postgres')
POSTGRES_PASSWORD = os.getenv('DB_PASSWORD', 'n3u3d4!')

POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# DuckDB (Warehouse - Analytics Database)
WAREHOUSE_PATH = os.getenv('WAREHOUSE_DB_PATH', './warehouse.duckdb')

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# ETL Configuration
BATCH_SIZE = int(os.getenv('ETL_BATCH_SIZE', '1000'))
