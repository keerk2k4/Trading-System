#!/usr/bin/env python3
"""Quick integration test script for ETL pipeline.

Usage:
    python test_etl_locally.py

This script will:
1. Check dependencies are installed
2. Test PostgreSQL connection
3. Run unit tests
4. Run integration test against PostgreSQL
5. Verify DuckDB has data
"""

import os
import sys
import subprocess
from pathlib import Path

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def run_command(cmd, description):
    print(f"▶ {description}...")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"✗ FAILED: {description}")
        print(result.stderr)
        return False
    print(f"✓ SUCCESS")
    if result.stdout.strip():
        print(result.stdout)
    return True

def check_postgres_connection():
    """Test PostgreSQL connection."""
    dsn = os.getenv("POSTGRES_DSN")
    if not dsn:
        print("✗ POSTGRES_DSN environment variable not set")
        return False
    
    print(f"▶ Testing PostgreSQL connection: {dsn}...")
    try:
        import psycopg
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM orders")
                count = cur.fetchone()[0]
                print(f"✓ PostgreSQL connected. Found {count} orders")
                return True
    except Exception as e:
        print(f"✗ PostgreSQL connection failed: {e}")
        return False

def check_dependencies():
    """Verify required packages are installed."""
    print("▶ Checking dependencies...")
    required = ["duckdb", "psycopg", "pytest"]
    missing = []
    
    for package in required:
        try:
            __import__(package)
            print(f"  ✓ {package}")
        except ImportError:
            print(f"  ✗ {package} NOT INSTALLED")
            missing.append(package)
    
    if missing:
        print(f"\n✗ Missing packages: {', '.join(missing)}")
        print(f"Install with: pip install -e . && pip install -e '.[dev]'")
        return False
    return True

def main():
    print_header("ETL Pipeline Local Testing")
    
    # Change to ETL directory
    etl_dir = Path(__file__).parent
    os.chdir(etl_dir)
    print(f"Working directory: {etl_dir}")
    
    # Step 1: Check dependencies
    print_header("Step 1: Checking Dependencies")
    if not check_dependencies():
        sys.exit(1)
    
    # Step 2: Check PostgreSQL
    print_header("Step 2: PostgreSQL Connection Test")
    postgres_available = check_postgres_connection()
    
    # Step 3: Run unit tests (no DB needed)
    print_header("Step 3: Running Unit Tests")
    if not run_command(
        "pytest tests/test_pipeline.py -v",
        "Running unit tests"
    ):
        sys.exit(1)
    
    # Step 4: Integration test (if PostgreSQL available)
    if postgres_available:
        print_header("Step 4: Integration Test (PostgreSQL → DuckDB)")
        
        print("▶ Running integration test...")
        test_code = '''
import os
import tempfile
import duckdb
from pathlib import Path
from trade_etl.pipeline import TradePipeline
from trade_etl.source import PostgresTradingSource

dsn = os.getenv("POSTGRES_DSN")
with tempfile.TemporaryDirectory() as tmpdir:
    warehouse = Path(tmpdir) / "test.duckdb"
    
    # Create pipeline
    source = PostgresTradingSource(dsn)
    pipeline = TradePipeline(str(warehouse), source)
    
    # Load data
    print("  Loading dimensions...")
    pipeline.load_dimensions()
    
    print("  Loading facts...")
    batch_id = pipeline.load_facts()
    
    # Verify
    trades = pipeline.connection.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
    dead_letters = pipeline.connection.execute("SELECT COUNT(*) FROM fact_trades_dead_letter").fetchone()[0]
    instruments = pipeline.connection.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0]
    accounts = pipeline.connection.execute("SELECT COUNT(*) FROM dim_account").fetchone()[0]
    
    pipeline.close()
    
    print(f"  ✓ Trades loaded: {trades}")
    print(f"  ✓ Dead letters: {dead_letters}")
    print(f"  ✓ Instruments: {instruments}")
    print(f"  ✓ Accounts: {accounts}")
    
    if trades == 0:
        print("  ⚠ WARNING: No trades found (may be expected if no orders in PostgreSQL)")
'''
        
        result = subprocess.run(
            [sys.executable, "-c", test_code],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"✗ Integration test failed")
            print(result.stderr)
            sys.exit(1)
        print(result.stdout)
        print("✓ Integration test passed")
    else:
        print("⊘ Skipping integration test (PostgreSQL not available)")
    
    # Summary
    print_header("Testing Complete ✓")
    print("Next steps:")
    print("1. Review TESTING_GUIDE.md for detailed documentation")
    print("2. Run: python -m trade_etl.cli all --warehouse trading.duckdb")
    print("3. Inspect results in DuckDB:")
    print("   duckdb trading.duckdb")
    print("   SELECT * FROM fact_trades LIMIT 5;")

if __name__ == "__main__":
    main()
