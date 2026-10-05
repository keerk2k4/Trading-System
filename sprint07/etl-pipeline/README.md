# Python ETL Pipeline for DuckDB Warehouse

A simple, clean Python-based ETL pipeline that reads from PostgreSQL and writes to DuckDB.

## Architecture

```
PostgreSQL (OLTP)          Python ETL Pipeline        DuckDB (OLAP)
   [Orders]        →  [Validate, Transform, Load]  →  [Warehouse]
   [Accounts]                                           [Dimensions]
   [Instruments]                                        [Facts]
```

## Features

- ✅ Read orders from PostgreSQL
- ✅ Validate data quality (8-point checks)
- ✅ Load dimensions (Date, Account, Instrument)
- ✅ Load facts into DuckDB
- ✅ Dead-lettering for rejected records
- ✅ Watermark-based incremental loading
- ✅ Batch tracking and summary
- ✅ Idempotent loading (no duplicates on re-run)

## Setup

### Prerequisites

- Python 3.8+
- PostgreSQL access (10.8.66.137:5432)
- DuckDB (auto-installed via pip)

### Installation

```bash
# Windows
pip install -r requirements.txt

# Linux/Mac
pip3 install -r requirements.txt
```

### Configuration

Edit `.env` file:

```properties
DB_HOST=10.8.66.137
DB_PORT=5432
DB_NAME=trading_system
DB_USERNAME=postgres
DB_PASSWORD=n3u3d4!

WAREHOUSE_DB_PATH=./warehouse.duckdb
LOG_LEVEL=INFO
```

## Usage

### Windows

```powershell
# Set environment
$env:DB_URL = "jdbc:postgresql://10.8.66.137:5432/trading_system"
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = "n3u3d4!"
$env:WAREHOUSE_DB_PATH = "C:\Users\Administrator\sprint6\warehouse.duckdb"

# Run ETL
python -m etl_pipeline.app

# Or use batch script
.\run.bat
```

### Linux/Mac

```bash
export DB_HOST=10.8.66.137
export DB_USERNAME=postgres
export DB_PASSWORD=n3u3d4!
export WAREHOUSE_DB_PATH=/app/warehouse.duckdb

python3 -m etl_pipeline.app

# Or use bash script
chmod +x run.sh
./run.sh
```

## Output Example

```
✓ ETL Complete
  Batch ID: BATCH_1789639500000_abc123de
  Total Records: 150
  Loaded: 148
  Rejected: 2
```

## Verify Results

### Query DuckDB

```powershell
# Windows
duckdb C:\Users\Administrator\sprint6\warehouse.duckdb "SELECT COUNT(*) FROM fact_trades;"

# Linux
duckdb /app/warehouse.duckdb "SELECT COUNT(*) FROM fact_trades;"
```

### Check Data

```bash
# Fact trades
SELECT order_id, side, quantity, price, trade_value FROM fact_trades LIMIT 10;

# Dimensions
SELECT COUNT(*) FROM dim_date;
SELECT COUNT(*) FROM dim_account;
SELECT COUNT(*) FROM dim_instrument;

# Watermark (incremental tracking)
SELECT * FROM etl_watermark;

# Rejected orders
SELECT order_id, failure_reason FROM etl_dlt_orders;

# Batch history
SELECT batch_id, records_loaded, records_rejected FROM etl_batch_summary;
```

## File Structure

```
etl-pipeline/
├── etl_pipeline/
│   ├── __init__.py          # Package init
│   ├── app.py               # Main CLI entry point
│   ├── config.py            # Configuration (reads from .env)
│   ├── database.py          # PostgreSQL connection
│   ├── warehouse.py         # DuckDB operations
│   └── etl_service.py       # ETL logic
├── requirements.txt         # Python dependencies
├── .env                     # Environment variables
├── run.bat                  # Windows launcher
├── run.sh                   # Linux/Mac launcher
└── README.md                # This file
```

## Key Differences from Java Version

| Aspect | Java | Python |
|--------|------|--------|
| Complexity | Higher (Spring config) | Lower (simple scripts) |
| Performance | Faster JVM | Suitable for ETL |
| Data ops | JDBC templates | Native libraries |
| Setup | Maven build required | Just `pip install` |
| Maintenance | Spring beans | Simple functions |

## Common Issues

### "Could not load JDBC driver"
This is Python - no JDBC needed! Just install `psycopg2` and `duckdb`.

### "Permission denied on warehouse.duckdb"
```bash
# Linux
chmod 777 /app/warehouse.duckdb

# Or use writable directory
export WAREHOUSE_DB_PATH=/tmp/warehouse.duckdb
```

### "Connection refused"
```bash
# Verify PostgreSQL is accessible
python3 -c "import psycopg2; psycopg2.connect('postgresql://postgres:n3u3d4!@10.8.66.137:5432/trading_system')"
```

## Next Steps

1. ✅ Run Python ETL locally to test
2. ✅ Verify DuckDB warehouse has data
3. ✅ Deploy to Linux VM
4. ✅ Schedule daily runs (cron/scheduler)
5. ✅ Integrate with Java REST API (optional)

## Support

For issues, check logs:
```bash
tail -f etl_pipeline.log
```
