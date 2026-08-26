"""Command-line interface for analytics-etl."""

import argparse

from .pipeline import extract, load, transform


def main() -> None:
    parser = argparse.ArgumentParser(description="Transform JSON or CSV records into analytics JSON.")
    parser.add_argument("input", help="path to a JSON or CSV input file")
    parser.add_argument("output", help="path for the transformed JSON output")
    args = parser.parse_args()
    load(transform(extract(args.input)), args.output)
    print(f"Wrote transformed records to {args.output}")
