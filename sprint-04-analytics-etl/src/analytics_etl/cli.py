"""Command-line interface for analytics-etl."""

import argparse

from .mock_api import API_URL
from .pipeline import extract, load, transform


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch, transform, and print analytics API data.")
    parser.parse_args()
    records = transform(extract())
    print(f"API: {API_URL}")
    load(records)
