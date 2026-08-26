import pytest

from analytics_etl.mock_api import MOCK_API_URL
from analytics_etl import extract, load, transform


def test_pipeline_transforms_records():
    assert transform(extract([{"id": 7, "value": "12.5", "date": "01-02-2026"}])) == [
        {"id": "7", "value": 12.5, "date": "01/02/2026"}
    ]


def test_malformed_input_is_rejected():
    with pytest.raises(ValueError, match="id, value, and date"):
        transform([{"id": "missing-value"}])


def test_extract_calls_unavailable_mock_api(monkeypatch):
    monkeypatch.setattr("analytics_etl.pipeline.fetch_records", lambda: [
        {"id": "demo", "value": 1, "date": "26-08-2026"}
    ])
    assert MOCK_API_URL.endswith(".invalid/analytics")
    assert extract() == [{"id": "demo", "value": 1, "date": "26-08-2026"}]


def test_load_writes_and_prints_dummy_file(tmp_path, capsys):
    destination = tmp_path / "dummy_output.json"
    load([{"id": "demo", "value": 1.0, "date": "26/08/2026"}], destination)
    assert '"date": "26/08/2026"' in destination.read_text(encoding="utf-8")
    assert "Dummy output written" in capsys.readouterr().out
