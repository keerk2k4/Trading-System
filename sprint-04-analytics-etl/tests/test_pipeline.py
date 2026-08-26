import sys

import pytest

from analytics_etl.extract import QuotaExceededError
from analytics_etl.pipeline import run_pipeline


def test_quota_exceeded_reports_usage_diagnostics(monkeypatch, capsys):
    monkeypatch.setattr("analytics_etl.pipeline.check_health", lambda: True)

    def fake_extract(symbol, start, end):
        raise QuotaExceededError(f"Quota exceeded while fetching {symbol}.")

    monkeypatch.setattr("analytics_etl.pipeline.extract", fake_extract)
    monkeypatch.setattr(
        "analytics_etl.pipeline.check_usage",
        lambda: {"used": 2000, "limit": 2000, "remaining": 0},
    )

    with pytest.raises(SystemExit):
        run_pipeline(symbols=["INFY.NS"])

    output = capsys.readouterr().out
    assert "STOPPING" in output
    assert "Quota status" in output
    assert "remaining" in output


def test_quota_exceeded_still_stops_even_if_usage_check_itself_fails(monkeypatch, capsys):
    monkeypatch.setattr("analytics_etl.pipeline.check_health", lambda: True)

    def fake_extract(symbol, start, end):
        raise QuotaExceededError(f"Quota exceeded while fetching {symbol}.")

    def failing_usage():
        raise RuntimeError("no key set")

    monkeypatch.setattr("analytics_etl.pipeline.extract", fake_extract)
    monkeypatch.setattr("analytics_etl.pipeline.check_usage", failing_usage)

    with pytest.raises(SystemExit):
        run_pipeline(symbols=["INFY.NS"])

    output = capsys.readouterr().out
    assert "STOPPING" in output
    assert "Could not fetch /usage" in output
