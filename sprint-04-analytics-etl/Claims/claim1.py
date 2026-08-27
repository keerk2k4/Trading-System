"""Plot candlestick charts with trend indicators from DuckDB.

Usage:
    python src/Candle-stick.py
    python src/Candle-stick.py --show
    python src/Candle-stick.py --symbol INFY.NS
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


def load_candles(
    db_path: Path,
    symbol: str | None = None,
) -> dict[str, pd.DataFrame]:
    """Load candle data from DuckDB."""

    print(f"Reading database: {db_path}")
    print(f"Looking for table: {TABLE_NAME}")

    query = f"""
        SELECT
            symbol,
            date,
            open,
            high,
            low,
            close
        FROM {TABLE_NAME}
        WHERE symbol = ? OR ? IS NULL
        ORDER BY symbol, date
    """

    with duckdb.connect(str(db_path), read_only=True) as connection:
        frame = connection.execute(
            query,
            [symbol, symbol],
        ).fetchdf()

    print(f"Rows loaded: {len(frame)}")

    if frame.empty:
        raise ValueError("No candle rows found in the database")

    # Convert date safely
    frame["date"] = pd.to_datetime(
        frame["date"],
        errors="coerce",
    )

    # Convert OHLC columns to numeric
    price_columns = [
        "open",
        "high",
        "low",
        "close",
    ]

    for column in price_columns:
        frame[column] = pd.to_numeric(
            frame[column],
            errors="coerce",
        )

    # Remove invalid rows
    frame = frame.dropna(
        subset=[
            "symbol",
            "date",
            "open",
            "high",
            "low",
            "close",
        ]
    )

    print(f"Valid rows after cleaning: {len(frame)}")

    if frame.empty:
        raise ValueError(
            "No valid candle rows found after cleaning"
        )

    candle_sets = {
        name: group.reset_index(drop=True)
        for name, group in frame.groupby("symbol")
    }

    print(f"Stocks found: {list(candle_sets.keys())}")

    return candle_sets


def calculate_trend(
    candles: pd.DataFrame,
    window: int = 20,
) -> tuple[pd.Series, str, float]:
    """Calculate moving average and long-term trend."""

    moving_average = candles["close"].rolling(
        window=min(window, len(candles)),
        min_periods=1,
    ).mean()

    first_value = moving_average.iloc[0]
    last_value = moving_average.iloc[-1]

    if first_value == 0:
        change_percent = 0.0
    else:
        change_percent = (
            (last_value - first_value)
            / first_value
            * 100
        )

    if change_percent > 1:
        trend = "INCREASING"
    elif change_percent < -1:
        trend = "DECREASING"
    else:
        trend = "NEUTRAL"

    return moving_average, trend, change_percent


def plot_candles(
    symbol: str,
    candles: pd.DataFrame,
    output_file: Path,
    show: bool = False,
) -> None:
    """Create and save a candlestick chart."""

    print(f"\nGenerating chart for {symbol}")
    print(f"Number of candles: {len(candles)}")

    figure, axis = plt.subplots(figsize=(14, 7))

    candle_width = 0.7

    # Draw candlesticks
    for index, candle in candles.iterrows():

        is_up = candle["close"] >= candle["open"]

        color = "green" if is_up else "red"

        # Draw high-low wick
        axis.vlines(
            index,
            candle["low"],
            candle["high"],
            color=color,
            linewidth=1,
        )

        # Calculate candle body
        body_bottom = min(
            candle["open"],
            candle["close"],
        )

        body_height = abs(
            candle["close"]
            - candle["open"]
        )

        # Make sure candles with equal open/close are visible
        if body_height == 0:
            body_height = 0.01

        # Draw candle body
        rectangle = Rectangle(
            (
                index - candle_width / 2,
                body_bottom,
            ),
            candle_width,
            body_height,
            facecolor=color,
            edgecolor=color,
        )

        axis.add_patch(rectangle)

    # Calculate trend
    moving_average, trend, change_percent = calculate_trend(
        candles,
        window=20,
    )

    # Plot moving average
    axis.plot(
        range(len(candles)),
        moving_average,
        label="20-period Moving Average",
        linewidth=2,
    )

    # Trend indicator
    if trend == "INCREASING":
        trend_text = "↑ INCREASING"
    elif trend == "DECREASING":
        trend_text = "↓ DECREASING"
    else:
        trend_text = "→ NEUTRAL"

    axis.text(
        0.02,
        0.95,
        f"LONG-TERM TREND: {trend_text}\n"
        f"Change: {change_percent:.2f}%",
        transform=axis.transAxes,
        fontsize=12,
        fontweight="bold",
        verticalalignment="top",
        bbox={
            "boxstyle": "round",
            "facecolor": "white",
            "alpha": 0.8,
        },
    )

    # Date labels
    tick_spacing = max(
        len(candles) // 10,
        1,
    )

    ticks = list(
        range(
            0,
            len(candles),
            tick_spacing,
        )
    )

    axis.set_xticks(ticks)

    axis.set_xticklabels(
        candles.iloc[ticks]["date"].dt.strftime(
            "%Y-%m-%d"
        ),
        rotation=45,
        ha="right",
    )

    axis.set_title(
        f"{symbol} Candlestick Chart"
    )

    axis.set_xlabel("Date")
    axis.set_ylabel("Price")

    axis.grid(
        axis="y",
        alpha=0.3,
    )

    axis.legend()

    figure.tight_layout()

    # Save chart
    print(f"Saving chart to: {output_file}")

    figure.savefig(
        output_file,
        dpi=150,
        bbox_inches="tight",
    )

    if output_file.exists():
        print(f"SUCCESS: Chart created")
    else:
        print(f"ERROR: Chart was not created")

    if show:
        plt.show()

    plt.close(figure)


def main() -> None:

    parser = argparse.ArgumentParser(
        description=(
            "Plot DuckDB candlestick data "
            "with trend indicators."
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
        "--symbol",
        help="Plot only one stock symbol",
    )

    parser.add_argument(
        "--show",
        action="store_true",
        help="Display charts after saving",
    )

    args = parser.parse_args()

    print("=" * 50)
    print("CANDLESTICK CHART GENERATOR")
    print("=" * 50)

    print(f"Database path: {args.db_path.absolute()}")
    print(f"Output directory: {args.output_dir.absolute()}")

    if not args.db_path.exists():
        parser.error(
            f"DuckDB database not found: "
            f"{args.db_path.absolute()}"
        )

    # Create charts directory
    args.output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    try:
        candle_sets = load_candles(
            args.db_path,
            args.symbol,
        )

    except (
        duckdb.Error,
        ValueError,
    ) as error:

        parser.error(
            f"Database error: {error}"
        )

    # Generate chart for each stock
    for symbol, candles in candle_sets.items():

        safe_symbol = symbol.replace(".", "_")

        output_file = (
            args.output_dir
            / f"{safe_symbol}.png"
        )

        try:

            plot_candles(
                symbol,
                candles,
                output_file,
                show=args.show,
            )

            print(
                f"Saved {output_file} "
                f"({len(candles)} candles)"
            )

        except Exception as error:

            print(
                f"ERROR generating chart "
                f"for {symbol}: {error}"
            )


if __name__ == "__main__":
    main()