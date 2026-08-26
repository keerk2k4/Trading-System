"""
transform.py

Takes data in, returns data out. Nothing else.
  - No network calls
  - No environment variables read
  - No files written (that is load.py's job)

Handles the real Fauxnance response shape:
    {"data": {"symbol": ..., "candles": [...]}, "meta": {...}}

And the dirty-data cases actually observed from the live API:
  - Duplicate rows for the same date (conflicting values)      -> keep the later one
  - Missing "close" field entirely                              -> row dropped
  - "open": "n/a" (string instead of number)                    -> row dropped
  - "high" < "low" (physically impossible)                      -> row dropped
  - "volume": -1 (negative, invalid)                             -> volume set to NaN, row kept
  - "volume": null                                               -> volume stays NaN, row kept
  - Date in "DD/MM/YYYY" mixed with ISO "YYYY-MM-DD"             -> both parsed correctly
  - "synthetic": true (fabricated/filled-in data, not real)      -> row dropped
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd

_FIELD_ALIASES = {
    "date": ["date", "t", "timestamp"],
    "open": ["open", "o"],
    "high": ["high", "h"],
    "low": ["low", "l"],
    "close": ["close", "c"],
    "adjclose": ["adjclose", "adj_close"],
    "volume": ["volume", "v"],
    "synthetic": ["synthetic"],
}


def _find_field(row: dict, canonical: str):
    for alias in _FIELD_ALIASES[canonical]:
        if alias in row:
            return row[alias]
    return None


def _parse_date(value):
    """
    Parses ISO ("2026-07-01") or "DD/MM/YYYY" ("09/07/2026"), checked in that
    order, strictly -- a slash-separated date is never mistaken for the
    US-style MM/DD/YYYY. A single Fauxnance response can genuinely mix both
    formats, so this is done per-value rather than trusting pandas' column-
    wide format inference.
    """
    if isinstance(value, str):
        try:
            return pd.Timestamp(datetime.strptime(value, "%Y-%m-%d"))
        except ValueError:
            pass
    try:
        return pd.to_datetime(value, dayfirst=True)
    except (ValueError, TypeError):
        return pd.NaT


def _raw_to_dataframe(raw: dict) -> pd.DataFrame:
    payload = raw.get("data", raw) if isinstance(raw, dict) else {}
    candles = payload.get("candles", []) if isinstance(payload, dict) else []
    symbol = payload.get("symbol") if isinstance(payload, dict) else None

    rows = []
    for c in candles:
        rows.append(
            {
                "symbol": symbol,
                "date": _find_field(c, "date"),
                "open": _find_field(c, "open"),
                "high": _find_field(c, "high"),
                "low": _find_field(c, "low"),
                "close": _find_field(c, "close"),
                "adjclose": _find_field(c, "adjclose"),
                "volume": _find_field(c, "volume"),
                "synthetic": _find_field(c, "synthetic"),
            }
        )
    return pd.DataFrame(rows)


def transform(raw: dict[str, Any]) -> pd.DataFrame:
    """
    Clean raw candle data. Steps:
      1. Parse into a DataFrame with proper types (dates may be mixed formats)
      2. Drop rows missing required price fields (close, open, high, low)
      3. Drop rows with impossible prices (high < low, non-positive prices)
      4. Drop rows flagged as synthetic (fabricated, not real trading data)
      5. Treat negative volume as missing (NaN) rather than dropping the row
      6. Deduplicate: same symbol+date reported twice -> keep the LAST entry
      7. Derive extra columns (daily return, trade range)
    """
    df = _raw_to_dataframe(raw)
    if df.empty:
        return df

    df["date"] = df["date"].apply(_parse_date)

    for col in ["open", "high", "low", "close", "adjclose", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["date", "open", "high", "low", "close"])
    if df.empty:
        return df

    df.loc[df["volume"] < 0, "volume"] = pd.NA

    is_synthetic = df["synthetic"].astype("boolean").fillna(False)
    valid_mask = (
        (df["high"] >= df["low"])
        & (df["open"] > 0)
        & (df["close"] > 0)
        & (df["high"] > 0)
        & (df["low"] > 0)
        & (~is_synthetic)
    )
    df = df[valid_mask].reset_index(drop=True)
    if df.empty:
        return df

    df = df.drop_duplicates(subset=["symbol", "date"], keep="last")

    df = df.sort_values("date").reset_index(drop=True)
    df["daily_return_pct"] = df.groupby("symbol")["close"].pct_change() * 100
    df["trade_range"] = df["high"] - df["low"]

    return df
