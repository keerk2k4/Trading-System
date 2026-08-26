"""Core functions for the analytics ETL pipeline."""

from __future__ import annotations

import csv
import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any


def extract(source: str | Path | Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Read records from a JSON/CSV path or an iterable of mappings."""
    if isinstance(source, (str, Path)):
        path = Path(source)
        if not path.is_file():
            raise FileNotFoundError(path)
        if path.suffix.lower() == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                raise ValueError("JSON input must contain a list of records")
            records = data
        elif path.suffix.lower() == ".csv":
            with path.open(newline="", encoding="utf-8") as handle:
                records = list(csv.DictReader(handle))
        else:
            raise ValueError("input must be a .json or .csv file")
    else:
        records = list(source)

    if any(not isinstance(record, Mapping) for record in records):
        raise ValueError("every input record must be an object")
    return [dict(record) for record in records]


def transform(records: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Normalize records and add a numeric order value for analytics."""
    transformed = []
    for record in records:
        if "id" not in record or "value" not in record:
            raise ValueError("every record must contain id and value")
        try:
            value = float(record["value"])
        except (TypeError, ValueError) as error:
            raise ValueError("record value must be numeric") from error
        transformed.append({"id": str(record["id"]), "value": value})
    return transformed


def load(records: Iterable[Mapping[str, Any]], destination: str | Path) -> Path:
    """Write transformed records as a JSON array and return its path."""
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(list(records), indent=2) + "\n", encoding="utf-8")
    return path
