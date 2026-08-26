"""
extract.py

"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()  # reads a local .env file into the environment, if present

BASE_URL = os.environ.get(
    "FAUXNANCE_BASE_URL",
    "https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1",
)
CACHE_DIR = Path(".cache")


class QuotaExceededError(RuntimeError):
    """The API reports the daily quota is used up. The pipeline should STOP."""


class SymbolRequestError(RuntimeError):
    """Bad request / bad symbol / bad key. The pipeline should SKIP this symbol and continue."""


def _api_key() -> str:
    
    key = os.environ.get("FAUXNANCE_API_KEY") or os.environ.get("API_KEY")
    if not key:
        raise RuntimeError(
            "FAUXNANCE_API_KEY is not set. Copy .env.example to .env and fill "
            "in your real key. Never hardcode it in source, a test, a fixture, "
            "or a committed notebook."
        )
    return key


def check_health() -> bool:
    """GET /health - needs no key. Check this before assuming anything is broken."""
    resp = requests.get(f"{BASE_URL}/health", timeout=10)
    return resp.ok


def check_usage() -> dict[str, Any]:
    """GET /usage - confirms the key works and shows remaining daily quota."""
    resp = requests.get(f"{BASE_URL}/usage", headers={"X-Api-Key": _api_key()}, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _cache_path(symbol: str, start: str, end: str) -> Path:
    safe_symbol = symbol.replace(".", "_")
    return CACHE_DIR / f"{safe_symbol}_{start}_{end}.json"


def extract(symbol: str, start: str, end: str, max_retries: int = 3) -> dict[str, Any]:
    """
    Fetch raw daily OHLCV candles for one symbol between start and end (YYYY-MM-DD).
    Returns the raw JSON response, unchanged. Uses an on-disk cache so repeat
    calls for the same symbol+range never hit the API again.
    """
    cache_file = _cache_path(symbol, start, end)
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    url = f"{BASE_URL}/candles/{symbol}"
    headers = {"X-Api-Key": _api_key()}
    params = {"start": start, "end": end}

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=15)
        except requests.ConnectionError as exc:
            last_error = exc  # network failure -> retry
            time.sleep(attempt)  # simple backoff: 1s, 2s, 3s
            continue

        if resp.status_code == 429:
            raise QuotaExceededError(
                f"Quota exceeded while fetching {symbol}. Stop and report this."
            )

        if resp.status_code in (400, 401, 403, 404):
            raise SymbolRequestError(
                f"Request for {symbol} failed with status {resp.status_code}: {resp.text}"
            )

        resp.raise_for_status()

        data = resp.json()
        CACHE_DIR.mkdir(exist_ok=True)
        cache_file.write_text(json.dumps(data))
        return data

    raise ConnectionError(
        f"Network failure fetching {symbol} after {max_retries} attempts: {last_error}"
    )
