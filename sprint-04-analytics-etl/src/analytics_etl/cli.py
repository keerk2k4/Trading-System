"""Command-line interface for analytics-etl."""

import argparse

from .mock_api import MOCK_API_URL
from .pipeline import extract, load, transform


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the analytics ETL demo with mock API data.")
    parser.add_argument(
        "--mock-api",
        action="store_true",
        help="call the nonexistent demo endpoint and use dummy data",
    )
    args = parser.parse_args()
    if not args.mock_api:
        parser.error("use --mock-api to run the demo")

    records = transform(extract())
    print(f"Mock API: {MOCK_API_URL}")
    print("API unavailable; using dummy data.")
    load(records)
