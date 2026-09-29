"""PostgreSQL extraction boundary.  Keeping it here makes pipeline tests DB-free."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Protocol


class TradingSource(Protocol):
    def instruments(self) -> Sequence[dict[str, Any]]: ...
    def accounts(self) -> Sequence[dict[str, Any]]: ...
    def order_date_bounds(self) -> tuple[datetime | None, datetime | None]: ...
    def orders_after(self, watermark: datetime | None) -> Sequence[dict[str, Any]]: ...


class PostgresTradingSource:
    """Reads the final Sprint 7 PostgreSQL schema using a short-lived connection."""

    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    def _query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(self.dsn, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                return list(cursor.fetchall())

    def instruments(self) -> Sequence[dict[str, Any]]:
        return self._query("""
            SELECT instrument_id, symbol, display_name, asset_class, quotation_currency
            FROM instruments ORDER BY instrument_id
        """)

    def accounts(self) -> Sequence[dict[str, Any]]:
        return self._query("""
            SELECT trading_account_id, account_number, account_status
            FROM trading_accounts ORDER BY trading_account_id
        """)

    def order_date_bounds(self) -> tuple[datetime | None, datetime | None]:
        row = self._query("SELECT min(created_at) AS first_date, max(created_at) AS last_date FROM orders")[0]
        return row["first_date"], row["last_date"]

    def orders_after(self, watermark: datetime | None) -> Sequence[dict[str, Any]]:
        # The >= boundary deliberately re-reads the last timestamp.  The fact merge
        # makes that safe and prevents missing two orders created in the same instant.
        # Dynamically determine which price column to use based on what exists in schema.
        price_column = self._get_price_column()
        sql = f"""
            SELECT order_id, trading_account_id, instrument_id, side, status, order_type,
                   {price_column} AS price, quantity, created_at
            FROM orders
        """
        if watermark:
            sql += "WHERE created_at >= %s"
            return self._query(sql + " ORDER BY created_at, order_id", (watermark,))
        else:
            return self._query(sql + "ORDER BY created_at, order_id")

    def _get_price_column(self) -> str:
        """Determine which price column exists in the orders table."""
        # Check if filled_price column exists
        result = self._query("""
            SELECT EXISTS(
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'orders' AND column_name = 'filled_price'
            ) AS has_filled_price
        """)
        if result and result[0].get('has_filled_price'):
            return "COALESCE(filled_price, limit_price)"
        # Fallback to limit_price if filled_price doesn't exist
        return "limit_price"
