"""Command-line interface for `analytics-etl` -- the teammate-facing entry point."""

import argparse

from .pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch Fauxnance candles, clean them, and load into DuckDB."
    )
    parser.parse_args()
    run_pipeline()
