"""Compare the value of an equally distributed ₹100,000 investment.

The total amount is split equally across three stocks. Each stock's
investment is valued using the first and latest available closing prices
in the DuckDB candles table.

Usage:
    python src/investment_comparison.py
    python src/investment_comparison.py --show
    python src/investment_comparison.py --symbols INFY.NS TCS.NS RELIANCE.NS
"""

from __future__ import annotations

import argparse
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import pandas as pd


DEFAULT_DB_PATH = Path(__file__).parents[1] / "analytics.duckdb"
OUTPUT_DIR = Path(__file__).with_name("charts")
TABLE_NAME = "candles"

TOTAL_INVESTMENT = 100_000


def load_stock_data(
    db_path: Path,
    symbols: list[str],
) -> pd.DataFrame:
    """Load closing prices for the selected stocks."""

    placeholders = ", ".join("?" for _ in symbols)

    query = f"""
        SELECT
            symbol,
            date,
            close
        FROM {TABLE_NAME}
        WHERE symbol IN ({placeholders})
        ORDER BY symbol, date
    """

    with duckdb.connect(
        str(db_path),
        read_only=True,
    ) as connection:

        frame = connection.execute(
            query,
            symbols,
        ).fetchdf()

    if frame.empty:
        raise ValueError("No stock data found")

    frame["date"] = pd.to_datetime(
        frame["date"],
        errors="coerce",
    )

    frame["close"] = pd.to_numeric(
        frame["close"],
        errors="coerce",
    )

    frame = frame.dropna(
        subset=[
            "symbol",
            "date",
            "close",
        ]
    )

    if frame.empty:
        raise ValueError("No valid stock data found")

    return frame


def get_available_symbols(
    db_path: Path,
) -> list[str]:
    """Get all available stock symbols."""

    query = f"""
        SELECT DISTINCT symbol
        FROM {TABLE_NAME}
        ORDER BY symbol
    """

    with duckdb.connect(
        str(db_path),
        read_only=True,
    ) as connection:

        frame = connection.execute(query).fetchdf()

    return frame["symbol"].tolist()


def calculate_investment_returns(
    frame: pd.DataFrame,
    total_investment: float,
) -> pd.DataFrame:
    """Calculate the current value of equally distributed investments."""

    symbols = frame["symbol"].unique()

    number_of_stocks = len(symbols)

    investment_per_stock = (
        total_investment / number_of_stocks
    )

    results = []

    for symbol, stock in frame.groupby("symbol"):

        stock = stock.sort_values("date")

        first_row = stock.iloc[0]
        latest_row = stock.iloc[-1]

        first_price = first_row["close"]
        latest_price = latest_row["close"]

        # Fractional shares are allowed for this simulation.
        shares_bought = (
            investment_per_stock / first_price
        )

        current_value = (
            shares_bought * latest_price
        )

        profit = (
            current_value
            - investment_per_stock
        )

        return_percent = (
            profit / investment_per_stock
        ) * 100

        results.append(
            {
                "symbol": symbol,
                "investment": investment_per_stock,
                "buy_date": first_row["date"],
                "buy_price": first_price,
                "latest_date": latest_row["date"],
                "latest_price": latest_price,
                "current_value": current_value,
                "profit": profit,
                "return_percent": return_percent,
            }
        )

    results_frame = pd.DataFrame(results)

    return results_frame.sort_values(
        "current_value",
        ascending=False,
    ).reset_index(drop=True)


def plot_investment_comparison(
    results: pd.DataFrame,
    total_investment: float,
    output_file: Path,
    show: bool = False,
) -> None:
    """Create a bar chart comparing investment values."""

    figure, axis = plt.subplots(
        figsize=(12, 7)
    )

    bars = axis.bar(
        results["symbol"],
        results["current_value"],
    )

    investment_per_stock = (
        total_investment / len(results)
    )

    # Reference line showing original investment
    axis.axhline(
        investment_per_stock,
        linestyle="--",
        linewidth=1.5,
        label=(
            f"Initial investment "
            f"per stock: ₹{investment_per_stock:,.2f}"
        ),
    )

    # Add current value and return percentage
    for bar, row in zip(
        bars,
        results.itertuples(),
    ):

        label = (
            f"₹{row.current_value:,.2f}\n"
            f"{row.return_percent:+.2f}%"
        )

        axis.text(
            bar.get_x()
            + bar.get_width() / 2,
            bar.get_height(),
            label,
            ha="center",
            va="bottom",
            fontsize=10,
        )

    latest_dates = (
        results["latest_date"]
        .dt.strftime("%Y-%m-%d")
        .unique()
    )

    latest_date_text = ", ".join(latest_dates)

    total_current_value = (
        results["current_value"].sum()
    )

    total_profit = (
        total_current_value
        - total_investment
    )

    total_return_percent = (
        total_profit
        / total_investment
        * 100
    )

    axis.set_title(
        "₹100,000 Equal Investment Comparison\n"
        f"Latest available data: {latest_date_text}"
    )

    axis.set_xlabel("Stock")

    axis.set_ylabel(
        "Current Investment Value (₹)"
    )

    axis.grid(
        axis="y",
        alpha=0.3,
    )

    axis.legend()

    # Portfolio summary
    summary = (
        f"Initial Portfolio: ₹{total_investment:,.2f}\n"
        f"Current Portfolio: ₹{total_current_value:,.2f}\n"
        f"Total Return: {total_return_percent:+.2f}%"
    )

    axis.text(
        0.02,
        0.98,
        summary,
        transform=axis.transAxes,
        verticalalignment="top",
        bbox={
            "boxstyle": "round,pad=0.5",
            "facecolor": "white",
            "alpha": 0.9,
        },
    )

    figure.tight_layout()

    figure.savefig(
        output_file,
        dpi=150,
        bbox_inches="tight",
    )

    print(f"Chart saved: {output_file}")

    if show:
        plt.show()

    plt.close(figure)


def main() -> None:

    parser = argparse.ArgumentParser(
        description=(
            "Compare an equally distributed "
            "₹100,000 investment across stocks."
        )
    )

    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB_PATH,
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
    )

    parser.add_argument(
        "--symbols",
        nargs=3,
        metavar="SYMBOL",
        help=(
            "Exactly three stock symbols. "
            "Example: "
            "--symbols INFY.NS TCS.NS RELIANCE.NS"
        ),
    )

    parser.add_argument(
        "--show",
        action="store_true",
        help="Display the chart after saving",
    )

    args = parser.parse_args()

    if not args.db_path.exists():
        parser.error(
            f"Database not found: {args.db_path}"
        )

    args.output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    available_symbols = get_available_symbols(
        args.db_path
    )

    if len(available_symbols) < 3:
        parser.error(
            "The database must contain "
            "at least three stocks."
        )

    # Use the three supplied stocks, or the
    # first three stocks available in the database.
    symbols = (
        args.symbols
        if args.symbols
        else available_symbols[:3]
    )

    print("=" * 60)
    print("₹100,000 EQUAL INVESTMENT ANALYSIS")
    print("=" * 60)

    print(
        f"Total investment: "
        f"₹{TOTAL_INVESTMENT:,.2f}"
    )

    print(
        f"Stocks selected: {', '.join(symbols)}"
    )

    print(
        f"Investment per stock: "
        f"₹{TOTAL_INVESTMENT / 3:,.2f}"
    )

    try:
        frame = load_stock_data(
            args.db_path,
            symbols,
        )

        found_symbols = set(
            frame["symbol"].unique()
        )

        missing_symbols = (
            set(symbols)
            - found_symbols
        )

        if missing_symbols:
            raise ValueError(
                "No data found for: "
                + ", ".join(
                    sorted(missing_symbols)
                )
            )

        results = (
            calculate_investment_returns(
                frame,
                TOTAL_INVESTMENT,
            )
        )

    except (
        duckdb.Error,
        ValueError,
    ) as error:

        parser.error(str(error))

    print("\nINDIVIDUAL STOCK PERFORMANCE")
    print("-" * 60)

    display_columns = [
        "symbol",
        "investment",
        "buy_date",
        "latest_date",
        "current_value",
        "profit",
        "return_percent",
    ]

    print(
        results[display_columns]
        .to_string(index=False)
    )

    total_current_value = (
        results["current_value"].sum()
    )

    total_profit = (
        total_current_value
        - TOTAL_INVESTMENT
    )

    total_return = (
        total_profit
        / TOTAL_INVESTMENT
        * 100
    )

    print("\nPORTFOLIO SUMMARY")
    print("-" * 60)

    print(
        f"Initial investment: "
        f"₹{TOTAL_INVESTMENT:,.2f}"
    )

    print(
        f"Current value: "
        f"₹{total_current_value:,.2f}"
    )

    print(
        f"Profit/Loss: "
        f"₹{total_profit:+,.2f}"
    )

    print(
        f"Total return: "
        f"{total_return:+.2f}%"
    )

    output_file = (
        args.output_dir
        / "investment_comparison.png"
    )

    plot_investment_comparison(
        results,
        TOTAL_INVESTMENT,
        output_file,
        show=args.show,
    )


if __name__ == "__main__":
    main()