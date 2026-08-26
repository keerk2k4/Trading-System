"""Core functions for the analytics ETL pipeline."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from .mock_api import fetch_records


def extract(source: Iterable[Mapping[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Call the mock API and return its records, or normalize supplied records."""
    if source is None:
        source = fetch_records()

    records = list(source)
    if any(not isinstance(record, Mapping) for record in records):
        raise ValueError("every input record must be an object")
    return [dict(record) for record in records]


def transform(records: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Return API records unchanged until transformation rules are defined."""
    transformed = []
    for record in records:
        if not isinstance(record, Mapping):
            raise ValueError("every record must be an object")
        transformed.append(dict(record))
    return transformed


def load(records: Iterable[Mapping[str, Any]], destination: str | Path = "dummy_output.json") -> Path:
    """Write transformed records to a dummy JSON file and print its contents."""
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(list(records), indent=2) + "\n"
    path.write_text(content, encoding="utf-8")
    print(f"Dummy output written to {path}")
    print(content, end="")
    return path
