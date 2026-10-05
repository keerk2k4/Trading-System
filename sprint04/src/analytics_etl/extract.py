"""
extract.py
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv


load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(message)s"
)

logger = logging.getLogger(__name__)


BASE_URL = os.environ.get(
    "FAUXNANCE_BASE_URL",
    "https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1",
)

CACHE_DIR = Path(".cache")


class QuotaExceededError(RuntimeError):
    """API quota exceeded. Pipeline must stop."""


class SymbolRequestError(RuntimeError):
    """Bad symbol/request. Only this symbol should fail."""


def _api_key() -> str:

    key = os.environ.get("FAUXNANCE_API_KEY") or os.environ.get("API_KEY")

    if not key:
        raise RuntimeError(
            "FAUXNANCE_API_KEY is not set. "
            "Never hardcode keys in source/tests."
        )

    return key


def check_health() -> bool:
    """
    GET /health does not require key.
    """

    resp = requests.get(
        f"{BASE_URL}/health",
        timeout=10
    )

    return resp.ok


def check_usage() -> dict[str, Any]:

    resp = requests.get(
        f"{BASE_URL}/usage",
        headers={"X-Api-Key": _api_key()},
        timeout=10
    )

    resp.raise_for_status()

    return resp.json()


def _cache_path(symbol: str, start: str, end: str) -> Path:

    safe_symbol = symbol.replace(".", "_")

    return CACHE_DIR / f"{safe_symbol}_{start}_{end}.json"


def extract(
    symbol: str,
    start: str,
    end: str,
    max_retries: int = 3
) -> dict[str, Any]:

    """
    Extract raw API response.

    Handles:
    429 -> stop
    other 4xx -> skip symbol
    timeout/network -> retry
    """

    cache_file = _cache_path(symbol, start, end)


    # Cache lookup first
    if cache_file.exists():

        logger.info(
            "CACHE_HIT symbol=%s",
            symbol
        )

        return json.loads(cache_file.read_text())


    url = f"{BASE_URL}/candles/{symbol}"

    headers = {
        "X-Api-Key": _api_key()
    }

    params = {
        "start": start,
        "end": end
    }


    last_error = None


    for attempt in range(1, max_retries + 1):

        try:

            resp = requests.get(
                url,
                headers=headers,
                params=params,
                timeout=15
            )


        except (
            requests.ConnectionError,
            requests.Timeout
        ) as exc:


            last_error = exc


            logger.warning(
                "NETWORK_ERROR symbol=%s attempt=%s/%s",
                symbol,
                attempt,
                max_retries
            )


            if attempt < max_retries:

                time.sleep(
                    2 ** (attempt - 1)
                )

            continue



        # -------- 429 RATE LIMIT --------

        if resp.status_code == 429:

            retry_after = resp.headers.get(
                "Retry-After",
                "unknown"
            )


            logger.error(
                "RATE_LIMIT symbol=%s retry_after=%s",
                symbol,
                retry_after
            )


            raise QuotaExceededError(
                f"Quota exceeded for {symbol}. "
                f"Retry after {retry_after} seconds."
            )


        # -------- OTHER 4XX --------

        if 400 <= resp.status_code < 500:


            logger.error(
                "SYMBOL_ERROR symbol=%s status=%s",
                symbol,
                resp.status_code
            )


            raise SymbolRequestError(
                f"{symbol} failed "
                f"status={resp.status_code}: {resp.text}"
            )


        resp.raise_for_status()


        data = resp.json()


        CACHE_DIR.mkdir(
            exist_ok=True
        )

        cache_file.write_text(
            json.dumps(data)
        )


        return data



    logger.error(
        "NETWORK_FAILED symbol=%s attempts=%s",
        symbol,
        max_retries
    )


    raise ConnectionError(
        f"Network failure fetching {symbol}: {last_error}"
    )