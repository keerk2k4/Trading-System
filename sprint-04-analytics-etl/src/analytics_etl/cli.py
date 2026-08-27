"""Command-line interface for `analytics-etl` -- the teammate-facing entry point."""

import argparse

from .pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Fauxnance candles, clean them, and load into DuckDB."
    )
    parser.add_argument("--from", dest="start", help="inclusive start date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="end", help="inclusive end date (YYYY-MM-DD)")
    args = parser.parse_args()
    run_pipeline(start=args.start, end=args.end)
if __name__ == "__main__":  
    main()