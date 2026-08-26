import pytest

from analytics_etl import extract, transform


def test_pipeline_transforms_records():
    assert transform(extract([{"id": 7, "value": "12.5"}])) == [{"id": "7", "value": 12.5}]


def test_malformed_input_is_rejected():
    with pytest.raises(ValueError, match="id and value"):
        transform([{"id": "missing-value"}])
