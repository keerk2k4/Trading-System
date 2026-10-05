"""Plot the progress of a ₹100,000 portfolio across three stocks.

The initial investment is divided equally among the three stocks.

Usage:
    python src/portfolio-growth.py
    python src/portfolio-growth.py --show
"""

from __future__ import annotations

import argparse
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd

DEFAULT_DB_PATH = r"C:\Users\Administrator\Desktop\Capstone Project\Sprint 05\chennai-capstone-SE1-team5\sprint04\analytics.duckdb"
OUTPUT_DIR = Path(__file__).with_name("charts")
OUTPUT_FILE = OUTPUT_DIR / "portfolio_growth.png"

TABLE_NAME = "candles"
INITIAL_INVESTMENT = 100_000

SYMBOLS = [
    "SUNPHARMA.NS",
    "HDFCBANK.NS",
    "EICHERMOT.NS",
]


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
        raise ValueError(
            "no candle rows found for the requested symbols"
        )

    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")

    frame = frame.dropna(
        subset=["symbol", "date", "close"]
    )

    frame = frame[frame["close"] > 0]

    if frame.empty:
        raise ValueError(
            "no valid closing prices found for the requested symbols"
        )

    missing_symbols = [
        symbol
        for symbol in symbols
        if symbol not in set(frame["symbol"])
    ]

    if missing_symbols:
        raise ValueError(
            f"missing candle rows for: {', '.join(missing_symbols)}"
        )

    return frame


def calculate_portfolio_value(
    closes: pd.DataFrame,
    initial_investment: float,
) -> pd.DataFrame:
    """Calculate the total value of an equally weighted portfolio."""

    data = closes.copy()

    # Split the initial investment equally between the stocks.
    investment_per_stock = initial_investment / len(SYMBOLS)

    # Find the first available closing price for each stock.
    first_close = (
        data.groupby("symbol")["close"]
        .transform("first")
    )

    # Calculate how much each stock portion is worth over time.
    data["stock_value"] = (
        investment_per_stock
        * data["close"]
        / first_close
    )

    # At each date, add the value of all stocks.
    portfolio = (
        data.groupby("date", as_index=False)["stock_value"]
        .sum()
        .rename(columns={"stock_value": "portfolio_value"})
    )

    return portfolio


def plot_portfolio_growth(
    portfolio: pd.DataFrame,
    output_file: Path,
    initial_investment: float,
    show: bool = False,
) -> None:
    """Render the total portfolio value as a line chart."""

    figure, axis = plt.subplots(figsize=(14, 7))

    axis.plot(
        portfolio["date"],
        portfolio["portfolio_value"],
        linewidth=2,
        label="Portfolio Value",
    )

    # Initial investment reference line.
    axis.axhline(
        initial_investment,
        color="#777777",
        linestyle="--",
        linewidth=1,
        label="Initial Investment",
    )

    axis.set_title(
        "Portfolio Progress: ₹100,000 Investment"
    )
    axis.set_xlabel("Date")
    axis.set_ylabel("Portfolio Value (INR)")

    axis.legend()
    axis.grid(axis="y", alpha=0.25)

    figure.tight_layout()
    figure.savefig(output_file, dpi=150)

    if show:
        plt.show()
    else:
        plt.close(figure)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Plot portfolio growth from DuckDB data."
    )

    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB_PATH,
    )

    parser.add_argument(
        "--output-file",
        type=Path,
        default=OUTPUT_FILE,
    )

    parser.add_argument(
        "--show",
        action="store_true",
        help="display the chart after saving",
    )

    args = parser.parse_args()

    if not args.db_path.exists():
        parser.error(
            f"DuckDB database not found: {args.db_path}"
        )

    args.output_file.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    try:
        closes = load_closes(
            args.db_path,
            SYMBOLS,
        )

        portfolio = calculate_portfolio_value(
            closes,
            INITIAL_INVESTMENT,
        )

        plot_portfolio_growth(
            portfolio,
            args.output_file,
            INITIAL_INVESTMENT,
            show=args.show,
        )

    except (duckdb.Error, ValueError) as error:
        parser.error(str(error))

    initial_value = portfolio["portfolio_value"].iloc[0]
    final_value = portfolio["portfolio_value"].iloc[-1]

    total_return = (
        (final_value - initial_value)
        / initial_value
    ) * 100

    print(
        f"Saved {args.output_file}"
    )

    print(
        f"Initial portfolio value: ₹{initial_value:,.2f}"
    )

    print(
        f"Final portfolio value: ₹{final_value:,.2f}"
    )

    print(
        f"Total return: {total_return:.2f}%"
    )


if __name__ == "__main__":
    main()