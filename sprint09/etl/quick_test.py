#!/usr/bin/env python3
"""Quick ETL test script to verify PostgreSQL -> DuckDB pipeline."""

import os
import sys
import tempfile
from pathlib import Path

# Try different connection strings
DSN_OPTIONS = [
    "postgresql://postgres@localhost/trading_system",  # No password, peer auth
    "postgresql://postgres:postgres@localhost/trading_system",
    "postgresql://admin:admin@localhost/trading_system",
    "postgresql://admin:password123@localhost/trading_system",
]

def test_postgres_connection():
    """Test PostgreSQL connection."""
    import psycopg
    from psycopg.rows import dict_row
    
    # Check if POSTGRES_DSN is set in environment
    env_dsn = os.getenv("POSTGRES_DSN")
    if env_dsn:
        DSN_OPTIONS.insert(0, env_dsn)
    
    for dsn in DSN_OPTIONS:
        try:
            print(f"\n▶ Testing: {dsn.split('@')[1] if '@' in dsn else dsn}")
            with psycopg.connect(dsn, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    # Check if trading_system database exists
                    cur.execute("""
                        SELECT datname FROM pg_database WHERE datname = 'trading_system'
                    """)
                    db_result = cur.fetchone()
                    if not db_result:
                        print("  ✗ trading_system database not found")
                        continue
                    
                    # Check tables
                    cur.execute("""
                        SELECT table_name FROM information_schema.tables 
                        WHERE table_schema = 'public'
                    """)
                    tables = [row['table_name'] for row in cur.fetchall()]
                    print(f"  ✓ Connected! Found {len(tables)} tables: {', '.join(sorted(tables))}")
                    
                    # Check data counts
                    required_tables = ['instruments', 'trading_accounts', 'orders']
                    for table in required_tables:
                        if table in tables:
                            cur.execute(f"SELECT COUNT(*) as cnt FROM {table}")
                            count = cur.fetchone()['cnt']
                            print(f"    - {table}: {count} rows")
                    
                    return dsn
        except Exception as e:
            error_msg = str(e)
            if "password" in error_msg.lower():
                print(f"  ✗ Password auth failed")
            else:
                print(f"  ✗ {error_msg.split(':')[0]}")
    
    return None

def test_etl_pipeline(dsn):
    """Test the ETL pipeline with the working connection."""
    print("\n" + "="*60)
    print("  TESTING ETL PIPELINE")
    print("="*60)
    
    from trade_etl.pipeline import TradePipeline
    from trade_etl.source import PostgresTradingSource
    
    with tempfile.TemporaryDirectory() as tmpdir:
        warehouse = Path(tmpdir) / "test.duckdb"
        
        print(f"\n▶ Creating pipeline with: {dsn}")
        source = PostgresTradingSource(dsn)
        pipeline = TradePipeline(str(warehouse), source)
        
        try:
            print("▶ Loading dimensions (instruments, accounts, dates)...")
            pipeline.load_dimensions()
            
            instruments = pipeline.connection.execute("SELECT COUNT(*) FROM dim_instrument").fetchone()[0]
            accounts = pipeline.connection.execute("SELECT COUNT(*) FROM dim_account").fetchone()[0]
            dates = pipeline.connection.execute("SELECT COUNT(*) FROM dim_date").fetchone()[0]
            print(f"  ✓ Dimensions loaded: {instruments} instruments, {accounts} accounts, {dates} dates")
            
            print("▶ Loading facts (orders -> trades)...")
            batch_id = pipeline.load_facts()
            
            trades = pipeline.connection.execute("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
            dead_letters = pipeline.connection.execute("SELECT COUNT(*) FROM fact_trades_dead_letter").fetchone()[0]
            
            print(f"  ✓ Facts loaded: {trades} trades, {dead_letters} dead letters")
            
            if trades > 0:
                print("\n▶ Sample trades:")
                samples = pipeline.connection.execute("""
                    SELECT * FROM fact_trades LIMIT 3
                """).fetchall()
                for row in samples:
                    print(f"    {row}")
            
            if dead_letters > 0:
                print("\n▶ Sample dead letters:")
                samples = pipeline.connection.execute("""
                    SELECT * FROM fact_trades_dead_letter LIMIT 3
                """).fetchall()
                for row in samples:
                    print(f"    {row}")
            
            pipeline.close()
            
            print("\n" + "="*60)
            print("  ✓ ETL PIPELINE WORKING!")
            print("="*60)
            print(f"\nSummary:")
            print(f"  PostgreSQL ✓ (Connected and working)")
            print(f"  Instruments ✓ ({instruments} loaded)")
            print(f"  Accounts ✓ ({accounts} loaded)")
            print(f"  Trades ✓ ({trades} loaded)")
            print(f"  Valid: {trades} | Errors: {dead_letters}")
            
            return True
        
        except Exception as e:
            print(f"\n✗ Error: {e}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  ETL PIPELINE LOCAL TEST")
    print("="*60)
    
    print("\n▶ Step 1: Testing PostgreSQL Connection")
    dsn = test_postgres_connection()
    
    if dsn:
        print(f"\n✓ Using: {dsn}")
        success = test_etl_pipeline(dsn)
        sys.exit(0 if success else 1)
    else:
        print("\n✗ Could not connect to PostgreSQL with any credentials")
        print("\nPlease set POSTGRES_DSN environment variable:")
        print("  $env:POSTGRES_DSN = 'postgresql://user:password@localhost/trading_system'")
        sys.exit(1)
