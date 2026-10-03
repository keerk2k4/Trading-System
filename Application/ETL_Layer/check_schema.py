#!/usr/bin/env python3
"""Check what columns exist in orders table."""

import os
import psycopg
from psycopg.rows import dict_row

dsn = os.getenv("POSTGRES_DSN")
if not dsn:
    print("POSTGRES_DSN not set")
    exit(1)

with psycopg.connect(dsn, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        # Get all columns in orders table
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'orders' 
            ORDER BY ordinal_position
        """)
        cols = cur.fetchall()
        print("Columns in 'orders' table:")
        for col in cols:
            print(f"  - {col['column_name']}: {col['data_type']}")
