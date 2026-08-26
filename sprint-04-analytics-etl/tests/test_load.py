import duckdb
import pandas as pd

from analytics_etl.load import load


def test_load_writes_rows_into_duckdb(tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    df = pd.DataFrame(
        {
            "symbol": ["INFY.NS"],
            "date": [pd.Timestamp("2026-07-01")],
            "open": [1584.5],
            "high": [1601.2],
            "low": [1580.05],
            "close": [1598.7],
            "adjclose": [1598.7],
            "volume": [7412300],
            "synthetic": [False],
            "daily_return_pct": [None],
            "trade_range": [21.15],
        }
    )

    load(df, db_path=db_path)

    con = duckdb.connect(db_path)
    result = con.execute("SELECT symbol, close FROM candles").fetchall()
    con.close()

    assert result == [("INFY.NS", 1598.7)]


def test_load_does_nothing_for_empty_dataframe(tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    load(pd.DataFrame(), db_path=db_path)
    # No exception, and no file should even be created for an empty frame's insert
