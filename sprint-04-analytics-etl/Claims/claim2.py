from pathlib import Path

import duckdb
import pandas as pd
import matplotlib.pyplot as plt


DB_PATH = Path(__file__).parents[1] / "analytics.duckdb"

TABLE_NAME = "candles"

INITIAL_INVESTMENT = 1000


def load_stock_data():

    query = f"""
        SELECT
            symbol,
            date,
            close
        FROM {TABLE_NAME}
        ORDER BY symbol, date
    """

    with duckdb.connect(
        str(DB_PATH),
        read_only=True,
    ) as connection:

        df = connection.execute(query).fetchdf()

    df["date"] = pd.to_datetime(df["date"])

    df["close"] = pd.to_numeric(
        df["close"],
        errors="coerce",
    )

    df = df.dropna(
        subset=[
            "symbol",
            "date",
            "close",
        ]
    )

    return df



def calculate_returns(df):

    results = []

    for symbol, stock in df.groupby("symbol"):

        stock = stock.sort_values("date")

        first_price = stock.iloc[0]["close"]
        latest_price = stock.iloc[-1]["close"]

        shares = INITIAL_INVESTMENT / first_price

        current_value = shares * latest_price

        profit = current_value - INITIAL_INVESTMENT

        return_percentage = (
            profit / INITIAL_INVESTMENT
        ) * 100


        results.append(
            {
                "symbol": symbol,
                "initial_amount": INITIAL_INVESTMENT,
                "current_value": round(
                    current_value,
                    2,
                ),
                "profit": round(
                    profit,
                    2,
                ),
                "return_percent": round(
                    return_percentage,
                    2,
                ),
                "latest_date": stock.iloc[-1]["date"],
            }
        )


    return pd.DataFrame(results)



def plot_comparison(results):

    plt.figure(figsize=(10,6))

    bars = plt.bar(
        results["symbol"],
        results["current_value"],
    )


    plt.title(
        "₹1000 Investment Growth Comparison"
    )

    plt.xlabel(
        "Stock"
    )

    plt.ylabel(
        "Current Value (₹)"
    )


    # Show values above bars
    for bar, value in zip(
        bars,
        results["current_value"],
    ):

        plt.text(
            bar.get_x() + bar.get_width()/2,
            bar.get_height(),
            f"₹{value}",
            ha="center",
            va="bottom",
        )


    plt.grid(
        axis="y",
        alpha=0.3,
    )

    plt.tight_layout()

    plt.savefig(
        "investment_comparison.png",
        dpi=150,
    )

    plt.show()



def main():

    df = load_stock_data()

    results = calculate_returns(df)

    print("\nInvestment Analysis")
    print("-------------------")

    print(results)


    best_stock = results.loc[
        results["current_value"].idxmax()
    ]


    print(
        "\nBest performing stock:"
    )

    print(
        best_stock[
            [
                "symbol",
                "current_value",
                "return_percent",
            ]
        ]
    )


    plot_comparison(results)



if __name__ == "__main__":
    main()