import sys

import pytest

import analytics_etl.extract  # noqa: F401 (ensures sys.modules is populated)
from analytics_etl.extract import extract

extract_module = sys.modules["analytics_etl.extract"]


def test_extract_refuses_to_run_without_a_key(monkeypatch, tmp_path, chdir_tmp):
    monkeypatch.delenv("FAUXNANCE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="FAUXNANCE_API_KEY is not set"):
        extract("INFY.NS", "2026-01-01", "2026-01-31")


def test_extract_uses_cache_and_never_calls_the_network_twice(monkeypatch, tmp_path, chdir_tmp):
    monkeypatch.setenv("FAUXNANCE_API_KEY", "test-key")

    call_count = {"n": 0}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"data": {"symbol": "INFY.NS", "candles": []}}

        def raise_for_status(self):
            pass

    def fake_get(url, headers=None, params=None, timeout=None):
        call_count["n"] += 1
        return FakeResponse()

    monkeypatch.setattr(extract_module.requests, "get", fake_get)

    first = extract("INFY.NS", "2026-01-01", "2026-01-31")
    second = extract("INFY.NS", "2026-01-01", "2026-01-31")

    assert first == second
    assert call_count["n"] == 1  # second call served from disk cache, not the network


@pytest.fixture
def chdir_tmp(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    yield tmp_path
