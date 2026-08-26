import pytest

import io
import json

from analytics_etl.mock_api import API_URL, fetch_records
from analytics_etl import extract, load, transform


def test_pipeline_transforms_records():
    records = [{"date": "2026-08-26", "open": 1, "close": 1}]
    assert transform(extract(records)) == records


def test_malformed_input_is_rejected():
    with pytest.raises(ValueError, match="object"):
        extract(["not an object"])


def test_extract_calls_real_api(monkeypatch):
    response = io.BytesIO(json.dumps({"data": {"candles": [
        {"date": "2026-08-26", "open": 1, "close": 1}
    ]}}).encode("utf-8"))
    response.__enter__ = lambda: response
    response.__exit__ = lambda *args: None
    monkeypatch.setenv("API_KEY", "test-key")

    def fake_urlopen(request, timeout):
        assert request.get_header("X-api-key") == "test-key"
        return response

    monkeypatch.setattr("analytics_etl.mock_api.urlopen", fake_urlopen)

    assert API_URL == "https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1/candles/AAPL"
    assert fetch_records() == [{"date": "2026-08-26", "open": 1, "close": 1}]


def test_load_writes_and_prints_dummy_file(tmp_path, capsys):
    destination = tmp_path / "dummy_output.json"
    load([{"id": "demo", "value": 1.0, "date": "26/08/2026"}], destination)
    assert '"date": "26/08/2026"' in destination.read_text(encoding="utf-8")
    assert "Dummy output written" in capsys.readouterr().out
