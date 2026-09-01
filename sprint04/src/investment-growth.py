"""Plot the value of an INR 100,000 investment across three stocks.

Usage:
	python src/investment-growth.py
	python src/investment-growth.py --show
"""

from __future__ import annotations

import argparse
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd


DEFAULT_DB_PATH = Path(__file__).parents[2] / "analytics.duckdb"
OUTPUT_DIR = Path(__file__).with_name("charts")
OUTPUT_FILE = OUTPUT_DIR / "investment_growth.png"
TABLE_NAME = "candles"
INITIAL_INVESTMENT = 100_000
SYMBOLS = ["SUNPHARMA.NS", "HDFCBANK.NS", "EICHERMOT.NS"]


def load_closes(db_path: Path, symbols: list[str]) -> pd.DataFrame:
	"""Load valid closing prices for the requested symbols from DuckDB."""
	placeholders = ", ".join("?" for _ in symbols)
	query = f"""
		SELECT symbol, date, close
		FROM {TABLE_NAME}
		WHERE symbol IN ({placeholders})
		ORDER BY date, symbol
	"""
	with duckdb.connect(str(db_path), read_only=True) as connection:
		frame = connection.execute(query, symbols).fetchdf()

	if frame.empty:
		raise ValueError("no candle rows found for the requested symbols")

	frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
	frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
	frame = frame.dropna(subset=["symbol", "date", "close"])
	frame = frame[frame["close"] > 0]
	if frame.empty:
		raise ValueError("no valid closing prices found for the requested symbols")
	missing_symbols = [symbol for symbol in symbols if symbol not in set(frame["symbol"])]
	if missing_symbols:
		raise ValueError(f"missing candle rows for: {', '.join(missing_symbols)}")
	return frame


def calculate_values(closes: pd.DataFrame, initial_investment: float) -> pd.DataFrame:
	"""Index each stock to the initial investment on its first trading date."""
	values = closes.copy()
	first_close = values.groupby("symbol")["close"].transform("first")
	values["investment_value"] = initial_investment * values["close"] / first_close
	return values


def plot_investment_values(
	values: pd.DataFrame,
	output_file: Path,
	show: bool = False,
) -> None:
	"""Render all stock investment values as lines on one chart."""
	figure, axis = plt.subplots(figsize=(14, 7))
	for symbol, group in values.groupby("symbol"):
		axis.plot(group["date"], group["investment_value"], linewidth=2, label=symbol)

	axis.axhline(INITIAL_INVESTMENT, color="#777777", linestyle="--", linewidth=1)
	axis.set_title("INR 100,000 investment value over time")
	axis.set_xlabel("Date")
	axis.set_ylabel("Investment value (INR)")
	axis.legend(title="Stock")
	axis.grid(axis="y", alpha=0.25)
	figure.tight_layout()
	figure.savefig(output_file, dpi=150)
	if show:
		plt.show()
	else:
		plt.close(figure)


def main() -> None:
	parser = argparse.ArgumentParser(description="Plot stock investment growth from DuckDB data.")
	parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
	parser.add_argument("--output-file", type=Path, default=OUTPUT_FILE)
	parser.add_argument("--show", action="store_true", help="display the chart after saving")
	args = parser.parse_args()

	if not args.db_path.exists():
		parser.error(f"DuckDB database not found: {args.db_path}")
	args.output_file.parent.mkdir(parents=True, exist_ok=True)
	try:
		closes = load_closes(args.db_path, SYMBOLS)
		values = calculate_values(closes, INITIAL_INVESTMENT)
		plot_investment_values(values, args.output_file, show=args.show)
	except (duckdb.Error, ValueError) as error:
		parser.error(str(error))

	print(f"Saved {args.output_file} ({values['symbol'].nunique()} stocks)")


if __name__ == "__main__":
	main()