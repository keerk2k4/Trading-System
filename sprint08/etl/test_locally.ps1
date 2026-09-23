# Quick Start: Test ETL Pipeline Locally
# For Windows PowerShell users

# Step 1: Navigate to ETL directory
Set-Location "sprint07/etl"
Write-Host "Working directory: $(Get-Location)" -ForegroundColor Green

# Step 2: Install dependencies (run this once)
Write-Host "`n=== Installing Dependencies ===" -ForegroundColor Cyan
pip install -e .
pip install -e ".[dev]"

# Step 3: Set PostgreSQL connection
# Modify this with your actual connection details
Write-Host "`n=== Setting PostgreSQL Connection ===" -ForegroundColor Cyan
$env:POSTGRES_DSN = "postgresql://postgres:postgres@localhost:5432/trading_system"
Write-Host "POSTGRES_DSN = $env:POSTGRES_DSN" -ForegroundColor Yellow

# Option A: Run unit tests ONLY (no database needed)
Write-Host "`n=== Running Unit Tests (No Database) ===" -ForegroundColor Cyan
pytest tests/test_pipeline.py -v

# Option B: If PostgreSQL is running, test full integration
Write-Host "`n=== Integration Test ===" -ForegroundColor Cyan
Write-Host "Making sure PostgreSQL is running at $env:POSTGRES_DSN" -ForegroundColor Yellow

# Create a test DuckDB file
$testDb = "test_local.duckdb"
Write-Host "`nTesting ETL flow to: $testDb" -ForegroundColor Cyan

# Step-by-step CLI commands
Write-Host "`n1. Initializing DuckDB schema..." -ForegroundColor Yellow
python -m trade_etl.cli init --warehouse $testDb

Write-Host "`n2. Loading dimensions (instruments & accounts)..." -ForegroundColor Yellow
python -m trade_etl.cli dimensions --warehouse $testDb

Write-Host "`n3. Loading facts (orders as trades)..." -ForegroundColor Yellow
python -m trade_etl.cli facts --warehouse $testDb

# Verify results
Write-Host "`n=== Verification ===" -ForegroundColor Cyan
Write-Host "Opening DuckDB to check results..." -ForegroundColor Yellow

$pythonCode = @"
import duckdb

conn = duckdb.connect('$testDb')

print("\n" + "="*50)
print("  DATA LOADED INTO DuckDB")
print("="*50)

trades = conn.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
dead_letters = conn.execute("SELECT COUNT(*) FROM fact_trades_dead_letter").fetchone()[0]
instruments = conn.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0]
accounts = conn.execute("SELECT COUNT(*) FROM dim_account").fetchone()[0]

print(f"Trades (fact_trades):        {trades}")
print(f"Dead letters (errors):       {dead_letters}")
print(f"Instruments (dim_instrument): {instruments}")
print(f"Accounts (dim_account):       {accounts}")

if trades > 0:
    print("\nSample trades:")
    results = conn.execute("SELECT trade_id, side, trade_value, created_at FROM fact_trades LIMIT 3").fetchall()
    for row in results:
        print(f"  {row}")

if dead_letters > 0:
    print("\nSample dead letters (errors):")
    results = conn.execute("SELECT order_id, reason, created_at FROM fact_trades_dead_letter LIMIT 3").fetchall()
    for row in results:
        print(f"  {row}")

conn.close()
print("\n✓ ETL Pipeline Test Complete!" -ForegroundColor Green)
"@

python -c $pythonCode

Write-Host "`n=== Summary ===" -ForegroundColor Green
Write-Host @"
If you see:
  ✓ Trades loaded > 0: PostgreSQL is connected and data is flowing to DuckDB
  ✓ Dead letters: Invalid records are being properly rejected
  ✓ Instruments/Accounts loaded: Dimension tables are populated

If you see 0 trades but no errors:
  - PostgreSQL may be running but has no orders yet
  - Check PostgreSQL to verify data exists:
    SELECT COUNT(*) FROM orders;

Next steps:
  1. Check the DuckDB file directly:
     duckdb $testDb
     SELECT * FROM fact_trades LIMIT 5;

  2. Run full pipeline with real warehouse name:
     python -m trade_etl.cli all --warehouse trading_analytics.duckdb

  3. Inspect schema:
     type src/trade_etl/schema.sql
"@
