"""
load.py

The ONLY module allowed to write data.
Saves the cleaned DataFrame into DuckDB, the project's analytics store.
"""

from __future__ import annotations

import duckdb
import pandas as pd

DEFAULT_DB_PATH = "analytics.duckdb"
TABLE_NAME = "candles"


def load(df: pd.DataFrame, db_path: str = DEFAULT_DB_PATH) -> None:
    """
    Append the cleaned candle data into a DuckDB table, creating it if needed.
    Re-running the pipeline for the same symbol+date does not create duplicates.
    """
    if df.empty:
        return

    con = duckdb.connect(db_path)
    try:
        con.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                symbol TEXT,
                date DATE,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                adjclose DOUBLE,
                volume DOUBLE,
                synthetic BOOLEAN,
                daily_return_pct DOUBLE,
                trade_range DOUBLE
            )
            """
        )
        con.register("df_view", df)
        con.execute(
            f"""
            DELETE FROM {TABLE_NAME}
            WHERE (symbol, date) IN (SELECT symbol, date FROM df_view)
            """
        )
        con.execute(f"INSERT INTO {TABLE_NAME} SELECT * FROM df_view")
    finally:
        con.close()
