from __future__ import annotations

import argparse
import os

from .pipeline import TradePipeline
from .source import PostgresTradingSource


def main() -> None:
    parser = argparse.ArgumentParser(description="Load trading analytics into DuckDB")
    parser.add_argument("command", choices=("init", "dimensions", "facts", "all"))
    parser.add_argument("--warehouse", default="trading_analytics.duckdb")
    parser.add_argument("--postgres-dsn", default=os.getenv("POSTGRES_DSN"))
    args = parser.parse_args()

    if args.command == "init":
        # No source connection is needed to create an empty warehouse.
        pipeline = TradePipeline(args.warehouse, _NoSource())
        pipeline.initialise()
        pipeline.close()
        return
    if not args.postgres_dsn:
        parser.error("--postgres-dsn or POSTGRES_DSN is required for dimensions and facts")

    pipeline = TradePipeline(args.warehouse, PostgresTradingSource(args.postgres_dsn))
    try:
        if args.command in ("dimensions", "all"):
            pipeline.load_dimensions()
        if args.command in ("facts", "all"):
            batch_id = pipeline.load_facts()
            print(f"fact batch completed: {batch_id}")
    finally:
        pipeline.close()


class _NoSource:
    def instruments(self):
        return []

    def accounts(self):
        return []

    def order_date_bounds(self):
        return None, None

    def orders_after(self, watermark):
        return []


if __name__ == "__main__":
    main()
