from __future__ import annotations

import json
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from importlib.resources import files
from typing import Any

import duckdb

from .source import TradingSource

VALID_SIDES = {"BUY", "SELL"}
VALID_STATUSES = {"NEW", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"}
PIPELINE_NAME = "fact_trades"


class TradePipeline:
    def __init__(self, warehouse_path: str, source: TradingSource) -> None:
        self.connection = duckdb.connect(warehouse_path)
        self.source = source

    def close(self) -> None:
        self.connection.close()

    def initialise(self) -> None:
        self.connection.execute(files("trade_etl").joinpath("schema.sql").read_text())

    def load_dimensions(self) -> None:
        self.initialise()
        first, last = self.source.order_date_bounds()
        if first and last:
            self._load_dates(first.date(), last.date())
        self._load_instruments()
        self._load_accounts()

    def load_facts(self) -> str:
        """Load one batch and return its batch id, including a no-op batch."""
        self.initialise()
        batch_id = str(uuid.uuid4())
        watermark = self._watermark()
        rows = self.source.orders_after(watermark)
        if not rows:
            return batch_id

        # A failed fact row never aborts unrelated rows.  Commit warehouse changes
        # and the watermark together so a crash cannot advance past unprocessed data.
        self.connection.execute("BEGIN TRANSACTION")
        try:
            max_created_at: datetime | None = None
            for row in rows:
                created_at = self._as_datetime(row.get("created_at"))
                if created_at and (max_created_at is None or created_at > max_created_at):
                    max_created_at = created_at
                reason = self._quality_error(row, created_at)
                if reason:
                    self._dead_letter(batch_id, row, reason)
                else:
                    self._merge_fact(row, created_at)
            if max_created_at:
                self.connection.execute("""
                    INSERT INTO etl_watermark AS target (pipeline_name, last_created_at)
                    VALUES (?, ?)
                    ON CONFLICT (pipeline_name) DO UPDATE
                    SET last_created_at = excluded.last_created_at
                """, [PIPELINE_NAME, max_created_at])
            self.connection.execute("COMMIT")
        except Exception:
            self.connection.execute("ROLLBACK")
            raise
        return batch_id

    def _load_dates(self, first: date, last: date) -> None:
        cursor = first
        rows = []
        while cursor <= last:
            rows.append((int(cursor.strftime("%Y%m%d")), cursor, cursor.day, cursor.month,
                         (cursor.month - 1) // 3 + 1, cursor.year))
            cursor += timedelta(days=1)
        self.connection.executemany("""
            INSERT INTO dim_date AS target
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (date_key) DO NOTHING
        """, rows)

    def _load_instruments(self) -> None:
        for row in self.source.instruments():
            self.connection.execute("""
                INSERT INTO dim_instrument AS target
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (source_instrument_id) DO UPDATE SET
                  symbol = excluded.symbol, display_name = excluded.display_name,
                  asset_class = excluded.asset_class, quotation_currency = excluded.quotation_currency
            """, [row["instrument_id"], row["symbol"], row["display_name"], row.get("asset_class"),
                  row.get("quotation_currency"), row["instrument_id"]])

    def _load_accounts(self) -> None:
        for row in self.source.accounts():
            self.connection.execute("""
                INSERT INTO dim_account AS target
                VALUES (?, ?, ?, ?)
                ON CONFLICT (source_account_id) DO UPDATE SET
                  account_number = excluded.account_number, account_status = excluded.account_status
            """, [row["trading_account_id"], row["account_number"], row["account_status"],
                  row["trading_account_id"]])

    def _watermark(self) -> datetime | None:
        result = self.connection.execute(
            "SELECT last_created_at FROM etl_watermark WHERE pipeline_name = ?", [PIPELINE_NAME]
        ).fetchone()
        return result[0] if result else None

    def _quality_error(self, row: dict[str, Any], created_at: datetime | None) -> str | None:
        if created_at is None:
            return "INVALID_CREATED_AT"
        if not self._exists("dim_date", "date_key", int(created_at.strftime("%Y%m%d"))):
            return "MISSING_DATE_DIMENSION"
        if not self._exists("dim_instrument", "source_instrument_id", row.get("instrument_id")):
            return "MISSING_INSTRUMENT_DIMENSION"
        if not self._exists("dim_account", "source_account_id", row.get("trading_account_id")):
            return "MISSING_ACCOUNT_DIMENSION"
        if row.get("side") not in VALID_SIDES:
            return "INVALID_SIDE"
        if row.get("status") not in VALID_STATUSES:
            return "INVALID_STATUS"
        quantity, price = self._decimal(row.get("quantity")), self._decimal(row.get("price"))
        if quantity is None or quantity <= 0:
            return "NON_POSITIVE_OR_INVALID_QUANTITY"
        if price is None or price <= 0:
            return "NON_POSITIVE_OR_INVALID_PRICE"
        if row.get("trade_value") is not None and self._decimal(row["trade_value"]) != quantity * price:
            return "TRADE_VALUE_MISMATCH"
        return None

    def _merge_fact(self, row: dict[str, Any], created_at: datetime) -> None:
        quantity, price = self._decimal(row["quantity"]), self._decimal(row["price"])
        date_key = int(created_at.strftime("%Y%m%d"))
        self.connection.execute("""
            INSERT INTO fact_trades AS target
              (source_order_id, date_key, instrument_key, account_key, side, status, order_type,
               quantity, price, trade_value, order_created_at)
            SELECT ?, ?, di.instrument_key, da.account_key, ?, ?, ?, ?, ?, ?, ?
            FROM dim_instrument di CROSS JOIN dim_account da
            WHERE di.source_instrument_id = ? AND da.source_account_id = ?
            ON CONFLICT (source_order_id) DO UPDATE SET
              date_key = excluded.date_key, instrument_key = excluded.instrument_key,
              account_key = excluded.account_key, side = excluded.side, status = excluded.status,
              order_type = excluded.order_type, quantity = excluded.quantity, price = excluded.price,
              trade_value = excluded.trade_value, order_created_at = excluded.order_created_at,
              loaded_at = excluded.loaded_at
        """, [row["order_id"], date_key, row["side"], row["status"], row["order_type"], quantity,
              price, quantity * price, created_at, row["instrument_id"], row["trading_account_id"]])

    def _dead_letter(self, batch_id: str, row: dict[str, Any], reason: str) -> None:
        self.connection.execute("""
            INSERT INTO fact_trades_dead_letter (batch_id, source_order_id, reason, raw_row)
            VALUES (CAST(? AS UUID), ?, ?, CAST(? AS JSON))
            ON CONFLICT (batch_id, source_order_id, reason) DO NOTHING
        """, [batch_id, row.get("order_id"), reason, json.dumps(row, default=str)])

    def _exists(self, table: str, column: str, value: Any) -> bool:
        return value is not None and self.connection.execute(
            f"SELECT 1 FROM {table} WHERE {column} = ?", [value]
        ).fetchone() is not None

    @staticmethod
    def _as_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, time.min)
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        return None

    @staticmethod
    def _decimal(value: Any) -> Decimal | None:
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None
