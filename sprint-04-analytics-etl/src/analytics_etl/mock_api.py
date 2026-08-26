"""Deterministic mock API client used for local demonstrations."""

from __future__ import annotations

from urllib.error import URLError
from urllib.request import urlopen


MOCK_API_URL = "https://api.example.invalid/analytics"
MOCK_RECORDS = [
    {"id": "demo-001", "value": 125.50, "date": "26-08-2026"},
    {"id": "demo-002", "value": 89.25, "date": "27-08-2026"},
    {"id": "demo-003", "value": 210.00, "date": "28-08-2026"},
]


def fetch_records() -> list[dict[str, str | float]]:
    """Try the nonexistent API, then return deterministic fallback data."""
    try:
        with urlopen(MOCK_API_URL, timeout=2):
            raise RuntimeError("the mock API unexpectedly exists")
    except (URLError, TimeoutError, OSError):
        return [record.copy() for record in MOCK_RECORDS]