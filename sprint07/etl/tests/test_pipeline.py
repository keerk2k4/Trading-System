from datetime import datetime

from trade_etl.pipeline import TradePipeline


class Source:
    def __init__(self, orders):
        self.orders = orders

    def instruments(self):
        return [{"instrument_id": 7, "symbol": "ACME", "display_name": "Acme Inc.",
                 "asset_class": "EQUITY", "quotation_currency": "INR"}]

    def accounts(self):
        return [{"trading_account_id": 11, "account_number": "ACC-11", "account_status": "ACTIVE"}]

    def order_date_bounds(self):
        dates = [row["created_at"] for row in self.orders if isinstance(row.get("created_at"), datetime)]
        return (min(dates), max(dates)) if dates else (None, None)

    def orders_after(self, watermark):
        return [row for row in self.orders if watermark is None or row["created_at"] >= watermark]


def order(**overrides):
    row = {
        "order_id": 1, "trading_account_id": 11, "instrument_id": 7,
        "side": "BUY", "status": "FILLED", "order_type": "LIMIT",
        "price": "12.50", "quantity": "4", "created_at": datetime(2026, 8, 10, 9, 30),
    }
    row.update(overrides)
    return row


def pipeline(tmp_path, rows):
    result = TradePipeline(str(tmp_path / "warehouse.duckdb"), Source(rows))
    result.load_dimensions()
    return result


def test_incremental_load_populates_fact_and_second_load_is_idempotent(tmp_path):
    etl = pipeline(tmp_path, [order()])
    etl.load_facts()
    assert etl.connection.execute("SELECT count(*) FROM fact_trades").fetchone()[0] == 1
    assert etl.connection.execute("SELECT trade_value FROM fact_trades").fetchone()[0] == 50

    etl.load_facts()
    assert etl.connection.execute("SELECT count(*) FROM fact_trades").fetchone()[0] == 1
    assert etl.connection.execute("SELECT count(*) FROM fact_trades_dead_letter").fetchone()[0] == 0
    etl.close()


def test_nulls_and_type_mismatches_are_dead_lettered_without_stopping_batch(tmp_path):
    invalid_quantity = order(order_id=2, quantity=None)
    invalid_price = order(order_id=3, price="not-a-number")
    valid = order(order_id=4, quantity="2")
    etl = pipeline(tmp_path, [invalid_quantity, invalid_price, valid])

    batch_id = etl.load_facts()
    assert etl.connection.execute("SELECT count(*) FROM fact_trades").fetchone()[0] == 1
    letters = etl.connection.execute("SELECT batch_id::VARCHAR, reason FROM fact_trades_dead_letter ORDER BY reason").fetchall()
    assert set(letters) == {
        (batch_id, "NON_POSITIVE_OR_INVALID_QUANTITY"),
        (batch_id, "NON_POSITIVE_OR_INVALID_PRICE"),
    }
    etl.close()


def test_invalid_dimension_reference_is_dead_lettered_with_reason_and_batch(tmp_path):
    etl = pipeline(tmp_path, [order(instrument_id=999)])
    batch_id = etl.load_facts()
    row = etl.connection.execute("SELECT batch_id::VARCHAR, reason FROM fact_trades_dead_letter").fetchone()
    assert row == (batch_id, "MISSING_INSTRUMENT_DIMENSION")
    assert etl.connection.execute("SELECT count(*) FROM fact_trades").fetchone()[0] == 0
    etl.close()
