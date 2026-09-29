# ETL Pipeline Local Testing Guide

This guide covers how to test the ETL pipeline locally to verify data fetching from PostgreSQL and loading to DuckDB.

## Prerequisites

- Python 3.12+
- PostgreSQL running locally or accessible
- DuckDB (installed via pip)
- psycopg3 (installed via pip)

## Setup Steps

### 1. Install Dependencies

```bash
cd sprint07/etl
pip install -e .
pip install -e ".[dev]"  # For pytest
```

### 2. Verify PostgreSQL Connection

Before running the pipeline, ensure PostgreSQL has the required schema and data:

```bash
# Connect to your local PostgreSQL
psql -U postgres -d your_database

# Verify these tables exist:
# - instruments
# - trading_accounts  
# - orders

# Check data exists:
SELECT COUNT(*) FROM instruments;
SELECT COUNT(*) FROM trading_accounts;
SELECT COUNT(*) FROM orders;
```

### 3. Set Environment Variables

Create a `.env` file or set environment variables:

```bash
# On Windows PowerShell:
$env:POSTGRES_DSN = "postgresql://username:password@localhost:5432/your_database"

# On Linux/Mac bash:
export POSTGRES_DSN="postgresql://username:password@localhost:5432/your_database"
```

For local development, you might use:
```
postgresql://postgres:postgres@localhost:5432/trading_system
```

## Testing Options

### Option A: Run Unit Tests (No Real Database Required)

This tests the pipeline logic with mock data:

```bash
cd sprint07/etl
pytest tests/test_pipeline.py -v
```

**What it verifies:**
- ✅ Pipeline processes mock orders correctly
- ✅ Invalid data is dead-lettered properly
- ✅ Transaction commits/rollbacks work
- ✅ Idempotency on second load

**Sample output:**
```
test_incremental_load_populates_fact_and_second_load_is_idempotent PASSED
test_nulls_and_type_mismatches_are_dead_lettered_without_stopping_batch PASSED
test_invalid_dimension_reference_is_dead_lettered_with_reason_and_batch PASSED
```

### Option B: Integration Test (With Real PostgreSQL)

Run the full pipeline against your local PostgreSQL:

```bash
cd sprint07/etl

# 1. Initialize DuckDB schema
python -m trade_etl.cli init --warehouse local_test.duckdb

# 2. Load dimensions from PostgreSQL
python -m trade_etl.cli dimensions --warehouse local_test.duckdb

# 3. Load facts from PostgreSQL
python -m trade_etl.cli facts --warehouse local_test.duckdb

# Or do all steps at once:
python -m trade_etl.cli all --warehouse local_test.duckdb
```

### Option C: Verify Data in DuckDB

After running the pipeline, query the DuckDB file to verify data loaded correctly:

```bash
cd sprint07/etl

# Connect to the DuckDB file
duckdb local_test.duckdb

# Inside DuckDB shell, run:
SELECT COUNT(*) as trades FROM fact_trades;
SELECT COUNT(*) as dead_letters FROM fact_trades_dead_letter;
SELECT * FROM fact_trades LIMIT 5;
SELECT * FROM fact_trades_dead_letter;
SELECT * FROM dim_instrument;
SELECT * FROM dim_account;
```

Or use Python:

```python
import duckdb

conn = duckdb.connect("local_test.duckdb")

# Check record counts
print("Trades loaded:", conn.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0])
print("Dead letters:", conn.execute("SELECT COUNT(*) FROM fact_trades_dead_letter").fetchone()[0])
print("Instruments:", conn.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0])
print("Accounts:", conn.execute("SELECT COUNT(*) FROM dim_account").fetchone()[0])

# Sample data
print("\nSample trades:")
print(conn.execute("SELECT * FROM fact_trades LIMIT 3").fetchall())

print("\nDead letters:")
print(conn.execute("SELECT * FROM fact_trades_dead_letter LIMIT 5").fetchall())

conn.close()
```

## Data Flow Verification Checklist

- [ ] PostgreSQL is accessible and has data
- [ ] Unit tests pass (`pytest tests/test_pipeline.py -v`)
- [ ] `python -m trade_etl.cli init` creates DuckDB file
- [ ] `python -m trade_etl.cli dimensions` loads instruments and accounts
- [ ] `python -m trade_etl.cli facts` loads orders as trades
- [ ] DuckDB file contains non-zero records in `fact_trades`
- [ ] Any invalid orders appear in `fact_trades_dead_letter`
- [ ] Second run of `load_facts()` doesn't duplicate data (idempotent)

## Troubleshooting

### PostgreSQL Connection Issues
```
Error: psycopg.OperationalError: could not connect to server
```
- Verify PostgreSQL is running: `psql --version`
- Check connection string format
- Verify credentials are correct

### Missing Tables
```
Error: relation "orders" does not exist
```
- Run migrations: `psql -f ../migrations/*.sql`
- Check schema matches what pipeline expects

### Data Not Loading
- Check `fact_trades_dead_letter` table for error reasons
- Verify instrument_id and trading_account_id references exist
- Check order dates are within loaded dimension date range

### DuckDB File Lock
```
Error: Cannot open database, another process is using it
```
- Close any other connections to `local_test.duckdb`
- Delete the file and restart: `rm local_test.duckdb`

## Advanced Testing

### Create a Custom Test with Real Data

Create `tests/test_integration.py`:

```python
import os
from datetime import datetime
from trade_etl.pipeline import TradePipeline
from trade_etl.source import PostgresTradingSource

def test_postgres_to_duckdb_integration(tmp_path):
    dsn = os.getenv("POSTGRES_DSN")
    if not dsn:
        pytest.skip("POSTGRES_DSN not set")
    
    source = PostgresTradingSource(dsn)
    warehouse = str(tmp_path / "test.duckdb")
    
    pipeline = TradePipeline(warehouse, source)
    pipeline.load_dimensions()
    batch_id = pipeline.load_facts()
    
    # Verify data
    trades = pipeline.connection.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
    assert trades > 0, "No trades loaded from PostgreSQL"
    
    pipeline.close()
    print(f"✓ Loaded {trades} trades from PostgreSQL to DuckDB")
```

Run with:
```bash
pytest tests/test_integration.py -v -s
```

## Next Steps

1. **Start with unit tests** - Quick sanity check
2. **Set up PostgreSQL locally** - Install and seed with test data
3. **Run integration test** - Verify PostgreSQL→DuckDB flow
4. **Monitor metrics** - Track record counts and errors
5. **Schedule pipeline** - Integrate with orchestrator (Kafka, cron, etc.)
