import pandas as pd

from analytics_etl.transform import transform


def _raw(candles, symbol="TEST.NS"):
    return {"data": {"symbol": symbol, "interval": "1d", "candles": candles}}


def test_transform_returns_clean_dataframe_for_valid_input():
    raw = _raw(
        [
            {"date": "2026-01-01", "open": 100, "high": 105, "low": 99, "close": 104, "volume": 1000},
            {"date": "2026-01-02", "open": 104, "high": 110, "low": 103, "close": 108, "volume": 1200},
        ]
    )
    df = transform(raw)
    assert len(df) == 2
    assert set(["open", "high", "low", "close", "daily_return_pct", "trade_range"]).issubset(df.columns)


def test_transform_rejects_malformed_input():
    """
    high < low is physically impossible for a real trading candle.
    transform() must drop that row rather than crash or silently keep bad data.
    """
    raw = _raw(
        [
            {"date": "2026-01-01", "open": 100, "high": 100, "low": 120, "close": 105, "volume": 1000},
            {"date": "2026-01-02", "open": 104, "high": 110, "low": 103, "close": 108, "volume": 1200},
        ]
    )
    df = transform(raw)
    assert len(df) == 1
    assert df.iloc[0]["close"] == 108


def test_transform_handles_empty_candles():
    df = transform(_raw([]))
    assert df.empty


def test_transform_handles_real_dirty_fauxnance_response():
    """
    Real response captured from GET /candles/TATASTEEL.BO, containing every
    dirty-data case seen from the live API.
    """
    raw = {
        "data": {
            "symbol": "TATASTEEL.BO",
            "interval": "1d",
            "currency": "INR",
            "candles": [
                {"date": "2026-07-01", "open": 168.4, "high": 170.15, "low": 167.8,
                 "close": 169.5, "adjclose": 169.5, "volume": 21204800, "synthetic": False},
                {"date": "2026-07-01", "open": 168.4, "high": 170.15, "low": 167.8,
                 "close": 168.95, "adjclose": 168.95, "volume": 21204800, "synthetic": False},
                {"date": "2026-07-02", "open": 169.6, "high": 172.4, "low": 169.1,
                 "adjclose": 171.72, "volume": 26031200, "synthetic": False},
                {"date": "2026-07-06", "open": "n/a", "high": 174.0, "low": 170.2,
                 "close": 172.45, "adjclose": 172.45, "volume": 18117300, "synthetic": False},
                {"date": "2026-07-07", "open": 172.5, "high": 168.1, "low": 175.85,
                 "close": 173.6, "adjclose": 173.6, "volume": 22448900, "synthetic": False},
                {"date": "2026-07-08", "open": 173.7, "high": 176.25, "low": 172.9,
                 "close": 175.8, "adjclose": 175.8, "volume": -1, "synthetic": False},
                {"date": "09/07/2026", "open": 175.9, "high": 178.4, "low": 174.55,
                 "close": 177.7, "adjclose": 177.7, "volume": 19320400, "synthetic": False},
            ],
        }
    }

    df = transform(raw)
    assert len(df) == 3

    surviving_dates = set(df["date"].dt.strftime("%Y-%m-%d"))
    assert surviving_dates == {"2026-07-01", "2026-07-08", "2026-07-09"}

    row_0701 = df[df["date"].dt.strftime("%Y-%m-%d") == "2026-07-01"].iloc[0]
    assert row_0701["close"] == 168.95  # kept the LATER duplicate

    row_0708 = df[df["date"].dt.strftime("%Y-%m-%d") == "2026-07-08"].iloc[0]
    assert pd.isna(row_0708["volume"])  # negative volume -> NaN, row kept

    assert "2026-07-09" in surviving_dates  # DD/MM/YYYY parsed correctly


def test_transform_drops_synthetic_rows():
    raw = _raw(
        [
            {"date": "2026-07-08", "open": 1589.4, "high": 1592.15, "low": 1583.7,
             "close": 1586.05, "volume": 5417600, "synthetic": True},
            {"date": "2026-07-09", "open": 1586.5, "high": 1612.4, "low": 1585.2,
             "close": 1609.75, "volume": 9640100, "synthetic": False},
        ],
        symbol="INFY.NS",
    )
    df = transform(raw)
    assert len(df) == 1
    assert df.iloc[0]["close"] == 1609.75
