"""
pipeline.py

Does NOTHING except wire extract -> transform -> load together, symbol by
symbol, applying the required error-handling policy:

    Problem                  -> Action
    ------------------------------------------------
    API quota exceeded       -> stop the whole pipeline and report
    Bad request / bad key    -> skip that symbol, continue with the rest
    Network failure          -> already retried inside extract()
    Bad data returned        -> already handled inside transform()
"""

from __future__ import annotations

import sys

from .extract import (
    QuotaExceededError,
    SymbolRequestError,
    check_health,
    check_usage,
    extract,
)
from .load import load
from .transform import transform

# At least two NSE/BSE instruments, as required. Reasons go in claims.md.
SYMBOLS = ["INFY.NS", "RELIANCE.NS", "TATASTEEL.BO"]
START_DATE = "2026-01-01"
END_DATE = "2026-07-31"


def run_pipeline(symbols: list[str] = SYMBOLS, start: str = START_DATE, end: str = END_DATE) -> None:
    if not check_health():
        print("Fauxnance API is not reachable (GET /health failed). Aborting.")
        sys.exit(1)

    for symbol in symbols:
        try:
            raw = extract(symbol, start, end)
        except QuotaExceededError as exc:
            print(f"STOPPING: {exc}")
            try:
                usage = check_usage()
                print(f"Quota status: {usage}")
            except Exception as usage_exc:
                # Even the diagnostic call can fail (e.g. no key at all) --
                # don't let that mask the original quota error.
                print(f"(Could not fetch /usage for diagnostics: {usage_exc})")
            sys.exit(1)
        except SymbolRequestError as exc:
            print(f"SKIPPING {symbol}: {exc}")
            continue
        except ConnectionError as exc:
            print(f"SKIPPING {symbol} after retries failed: {exc}")
            continue

        clean_df = transform(raw)
        if clean_df.empty:
            print(f"No valid rows for {symbol} after cleaning; skipping load.")
            continue

        load(clean_df)
        print(f"Loaded {len(clean_df)} rows for {symbol}.")

    print("Pipeline complete.")
