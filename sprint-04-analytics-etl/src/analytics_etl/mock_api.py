"""Client for the analytics API used by the ETL pipeline."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


API_URL = "https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1/candles/AAPL"


def _load_api_key() -> str | None:
    """Read API_KEY from the environment or the repository .env file."""
    if api_key := os.environ.get("API_KEY"):
        return api_key

    env_path = next(
        (path for path in (Path.cwd() / ".env", Path(__file__).parents[3] / ".env") if path.is_file()),
        None,
    )
    if env_path is None:
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "API_KEY":
            return value.strip().strip('"').strip("'")
    return None


def fetch_records() -> list[dict[str, Any]]:
    """Fetch records from the analytics API."""
    api_key = _load_api_key()
    if not api_key:
        raise RuntimeError("API_KEY is not set; set it before running the pipeline")

    request = Request(
        API_URL,
        headers={"Accept": "application/json", "x-api-key": api_key},
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RuntimeError(f"API request failed with HTTP {error.code}: {error.reason}") from error

    if (
        isinstance(payload, dict)
        and isinstance(payload.get("data"), dict)
        and isinstance(payload["data"].get("candles"), list)
    ):
        records = payload["data"]["candles"]
    else:
        raise ValueError("API response must contain a list of records")

    if any(not isinstance(record, dict) for record in records):
        raise ValueError("API records must be JSON objects")
    return records