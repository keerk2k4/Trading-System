"""Plot candlestick charts from the ETL DuckDB database.

Usage:
	python src/Candle-stick.py
	python src/Candle-stick.py --show
"""

from __future__ import annotations

import argparse
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Rectangle


DEFAULT_DB_PATH = Path(__file__).parents[1] / "analytics.duckdb"
OUTPUT_DIR = Path(__file__).with_name("charts")
TABLE_NAME = "candles"


def load_candles(db_path: Path, symbol: str | None = None) -> dict[str, pd.DataFrame]:
	query = f"""
		SELECT symbol, date, open, high, low, close
		FROM {TABLE_NAME}
		WHERE symbol = ? OR ? IS NULL
		ORDER BY symbol, date
	"""
	with duckdb.connect(str(db_path), read_only=True) as connection:
		frame = connection.execute(query, [symbol, symbol]).fetchdf()

	if frame.empty:
		raise ValueError("no candle rows found")
	frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
	frame = frame.dropna(subset=["symbol", "date", "open", "high", "low", "close"])
	if frame.empty:
		raise ValueError("no valid candle rows found")
	return {name: group.reset_index(drop=True) for name, group in frame.groupby("symbol")}


def plot_candles(symbol: str, candles: pd.DataFrame, output_file: Path, show: bool = False) -> None:
	"""Render a simple OHLC candlestick chart and save it as a PNG."""
	figure, axis = plt.subplots(figsize=(14, 7))
	candle_width = 0.7

	for index, candle in candles.iterrows():
		is_up = candle["close"] >= candle["open"]
		color = "#16876a" if is_up else "#d1495b"
		axis.vlines(index, candle["low"], candle["high"], color=color, linewidth=1)
		body_bottom = min(candle["open"], candle["close"])
		body_height = max(abs(candle["close"] - candle["open"]), 0.01)
		axis.add_patch(
			Rectangle(
				(index - candle_width / 2, body_bottom),
				candle_width,
				body_height,
				facecolor=color,
				edgecolor=color,
			)
		)

	tick_spacing = max(len(candles) // 10, 1)
	ticks = range(0, len(candles), tick_spacing)
	axis.set_xticks(list(ticks))
	axis.set_xticklabels(candles.loc[list(ticks), "date"].dt.strftime("%Y-%m-%d"), rotation=45, ha="right")
	axis.set_title(f"{symbol} candlestick chart")
	axis.set_xlabel("Date")
	axis.set_ylabel("Price")
	axis.grid(axis="y", alpha=0.25)
	figure.tight_layout()
	figure.savefig(output_file, dpi=150)
	if show:
		plt.show()
	else:
		plt.close(figure)


def main() -> None:
	parser = argparse.ArgumentParser(description="Plot DuckDB Fauxnance candlestick data.")
	parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
	parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
	parser.add_argument("--symbol", help="plot only one symbol, for example INFY.NS")
	parser.add_argument("--show", action="store_true", help="display charts after saving")
	args = parser.parse_args()

	if not args.db_path.exists():
		parser.error(f"DuckDB database not found: {args.db_path}")
	args.output_dir.mkdir(parents=True, exist_ok=True)
	try:
		candle_sets = load_candles(args.db_path, args.symbol)
	except (duckdb.Error, ValueError) as error:
		parser.error(str(error))

	for symbol, candles in candle_sets.items():
		output_file = args.output_dir / f"{symbol.replace('.', '_')}.png"
		plot_candles(symbol, candles, output_file, show=args.show)
		print(f"Saved {output_file} ({len(candles)} candles)")


if __name__ == "__main__":
	main()
