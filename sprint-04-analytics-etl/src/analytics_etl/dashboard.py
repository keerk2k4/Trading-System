"""Create the offline Swag Analytics dashboard from DuckDB."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pandas as pd
import plotly.offline as offline

DEFAULT_DB_PATH = "analytics.duckdb"
DEFAULT_OUTPUT_PATH = "dashboard.html"
SYMBOLS = ["SUNPHARMA.NS", "HDFCBANK.NS", "TMCV.NS"]


def _rows(db_path: str) -> list[dict]:
    """Read only configured instruments from the DuckDB candle table."""
    database = Path(db_path)
    if not database.exists():
        return []

    connection = duckdb.connect(str(database), read_only=True)
    try:
        frame = connection.execute(
            "SELECT * FROM candles ORDER BY symbol, date"
        ).df()
    finally:
        connection.close()

    if frame.empty:
        return []

    frame = frame[frame["symbol"].isin(SYMBOLS)]
    if frame.empty:
        return []

    frame["date"] = pd.to_datetime(frame["date"]).dt.strftime("%Y-%m-%d")
    return frame.where(frame.notna(), None).to_dict(orient="records")


def create_dashboard(
    db_path: str = DEFAULT_DB_PATH,
    output_path: str = DEFAULT_OUTPUT_PATH,
) -> Path:
    """Write a self-contained dashboard with symbol and window filters."""
    data = json.dumps(_rows(db_path), default=str).replace("</", "<\\/")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Swag Analytics</title>
  <script>{offline.get_plotlyjs()}</script>
  <style>
    :root {{
      --background: #f7f8fc;
      --surface: #ffffff;
      --indigo: #4338ca;
      --indigo-dark: #312e81;
      --light: #6366f1;
      --muted: #5b6078;
      --border: #dfe3f2;
    }}

    * {{ box-sizing: border-box; }}

    body {{
      margin: 0;
      background: var(--background);
      color: #1e1b4b;
      font-family: "Trebuchet MS", Verdana, sans-serif;
    }}

    main {{
      max-width: 1250px;
      margin: auto;
      padding: 34px 5vw 58px;
    }}

    header {{
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 30px;
      padding-bottom: 20px;
    }}

    h1 {{
      margin: 0;
      font-size: clamp(42px, 7vw, 84px);
      line-height: 0.9;
    }}

    .intro {{
      max-width: 350px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }}

    .controls {{
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 20px;
      margin: 22px 0 8px;
    }}

    label {{
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }}

    select,
    button {{
      display: block;
      min-height: 36px;
      margin-top: 7px;
      padding: 9px 10px;
      border: 0;
      background: var(--surface);
      color: #1e1b4b;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: 14px "Trebuchet MS", Verdana, sans-serif;
    }}

    select {{ min-width: 150px; }}
    option {{ background: var(--surface); color: #1e1b4b; }}
    button {{ cursor: pointer; outline: 1px solid var(--border); }}
    button:hover,
    button.active {{ background: var(--indigo); color: #ffffff; outline-color: var(--indigo); }}

    #ranges {{ display: flex; flex-wrap: wrap; gap: 6px; }}
    #status {{ margin: 16px 0; color: var(--muted); font-size: 12px; }}

    .kpis {{
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin: 22px 0 28px;
    }}

    .kpi {{ padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); box-shadow: 0 3px 10px rgba(49, 46, 129, 0.08); }}
    .kpi span {{ display: block; color: var(--muted); font-size: 11px; }}
    .kpi strong {{ display: block; margin-top: 7px; color: var(--indigo-dark); font-size: 20px; }}
    .chart {{ min-width: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }}

    .claims {{
      display: grid;
      gap: 18px;
      margin-top: 44px;
    }}

    .claim-card {{
      padding: 18px 0;
      padding: 22px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }}

    .claim-card h2 {{
      margin: 0 0 14px;
      color: var(--indigo-dark);
      font-size: 17px;
    }}

    .claim-images {{
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}

    .claim-images img {{
      display: block;
      width: min(100%, 360px);
      height: auto;
    }}

    .claim-two-image {{
      width: min(100%, 900px) !important;
    }}

    .claim-placeholder {{
      min-height: 70px;
      color: var(--muted);
      font-size: 13px;
    }}

    details {{
      margin-top: 44px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }}

    summary {{
      padding: 18px 0;
      color: var(--indigo-dark);
      cursor: pointer;
      font-size: 18px;
      font-weight: 700;
    }}

    .plotly-section {{
      display: grid;
      gap: 22px;
      padding-bottom: 24px;
    }}

    .plotly-chart {{
      width: 100%;
      min-height: 430px;
    }}

    .section-title {{
      margin: 42px 0 8px;
      color: var(--indigo-dark);
      font-size: 18px;
    }}

    .insight {{
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 12px;
    }}

    @media (max-width: 760px) {{
      header {{ display: block; }}
      .intro {{ margin-top: 20px; }}
      .kpis {{ grid-template-columns: repeat(2, 1fr); }}
      .claim-images img {{ width: 100%; }}
    }}
  </style>
</head>
<body>
  <main>
    <section class="controls">
      <label>Instrument<select id="symbol"></select></label>
      <label>Window<div id="ranges"></div></label>
    </section>

    <div id="status"></div>

    <section class="kpis">
      <div class="kpi"><span>Last close</span><strong id="close">—</strong></div>
      <div class="kpi"><span>Window return</span><strong id="return">—</strong></div>
      <div class="kpi"><span>High / low</span><strong id="highlow">—</strong></div>
      <div class="kpi"><span>Average volume</span><strong id="volume">—</strong></div>
    </section>

    <section class="chart" id="price"></section>

    <section class="claims">
      <article class="claim-card">
        <h2>Claim 1: Can you actually make money by staying invested in one particular instrument?</h2>
        <div class="claim-images">
          <img src="Claims/charts/SUNPHARMA_NS.png" alt="Sun Pharma candlestick chart" scale="2.5">
          <img src="Claims/charts/EICHERMOT_NS.png" alt="Eicher Motors candlestick chart" scale="2.5">
          <img src="Claims/charts/HDFCBANK_NS.png" alt="HDFC Bank candlestick chart" scale="2.5">
        </div>
      </article>
      <article class="claim-card">
        <h2>Claim 2: Do you need to pick a winner from each sector?</h2>
        <div class="claim-images">
          <img class="claim-two-image" src="Claims/Comparison_chart.png" alt="Investment comparison chart">
        </div>
      </article>
      <article class="claim-card">
        <h2>Claim 3: Does diversification actually make profits?</h2>
        <div class="claim-placeholder">Chart to be added.</div>
      </article>
    </section>

    <details>
      <section class="plotly-section">
        <h2 class="section-title">Market comparison</h2>
        <p class="insight" id="comparison-insight">Comparison uses all loaded instruments over the selected window.</p>
        <section class="chart plotly-chart" id="comparison"></section>
        <section class="chart plotly-chart" id="ranking"></section>
      </section>
    </details>
  </main>

  <script>
    const rows = {data};
    const symbols = {json.dumps(SYMBOLS)};
    const windows = [
      ["all", "All"], ["365", "1Y"], ["180", "6M"], ["90", "3M"],
      ["60", "2M"], ["30", "1M"], ["14", "2W"], ["7", "1W"], ["10", "10D"]
    ];
    let selectedWindow = "all";
    const symbolSelect = document.getElementById("symbol");
    symbols.forEach((symbol) => {{
      const option = document.createElement("option");
      option.value = symbol;
      option.textContent = symbol;
      symbolSelect.appendChild(option);
    }});

    windows.forEach(([key, label]) => {{
      const button = document.createElement("button");
      button.textContent = label;
      button.dataset.key = key;
      button.addEventListener("click", () => {{
        selectedWindow = key;
        draw();
      }});
      document.getElementById("ranges").appendChild(button);
    }});

    symbolSelect.addEventListener("change", draw);

    document.querySelector("details").addEventListener("toggle", (event) => {{
      if (event.target.open) {{
        window.requestAnimationFrame(() => {{
          Plotly.Plots.resize("comparison");
          Plotly.Plots.resize("ranking");
        }});
      }}
    }});

    function selectedRows() {{
      let data = rows
        .filter((row) => row.symbol === symbolSelect.value)
        .sort((left, right) => left.date.localeCompare(right.date));

      if (selectedWindow !== "all" && data.length) {{
        const start = new Date(data[data.length - 1].date);
        start.setDate(start.getDate() - Number(selectedWindow));
        data = data.filter((row) => new Date(row.date) >= start);
      }}
      return data;
    }}

    function layout(title) {{
      return {{
        title: {{ text: title, x: 0.03, font: {{ family: "Trebuchet MS", size: 15, color: "#1e1b4b" }} }},
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        font: {{ family: "Trebuchet MS", color: "#5b6078" }},
        margin: {{ left: 55, right: 18, top: 48, bottom: 45 }},
        xaxis: {{ title: "Date", gridcolor: "#e5e7eb" }},
        yaxis: {{ title: "Price", gridcolor: "#e5e7eb" }},
        hovermode: "x unified",
        height: 430
      }};
    }}

    function comparisonLayout(title, yAxisTitle) {{
      const chart = layout(title);
      chart.yaxis.title = yAxisTitle;
      return chart;
    }}

    function drawComparison() {{
      const selectedData = {{}};
      rows.forEach((row) => {{
        if (!selectedData[row.symbol]) selectedData[row.symbol] = [];
        selectedData[row.symbol].push(row);
      }});

      const traces = [];
      const ranking = [];
      Object.entries(selectedData).forEach(([name, values]) => {{
        values.sort((left, right) => left.date.localeCompare(right.date));
        if (selectedWindow !== "all" && values.length) {{
          const start = new Date(values[values.length - 1].date);
          start.setDate(start.getDate() - Number(selectedWindow));
          values = values.filter((row) => new Date(row.date) >= start);
        }}
        if (!values.length) return;
        const first = values[0].close;
        const last = values[values.length - 1].close;
        ranking.push({{ name, value: ((last / first) - 1) * 100 }});
        traces.push({{
          x: values.map((row) => row.date),
          y: values.map((row) => (row.close / first) * 100),
          mode: "lines",
          name,
          line: {{ width: 2 }}
        }});
      }});

      if (!traces.length) {{
        Plotly.purge("comparison");
        Plotly.purge("ranking");
        return;
      }}

      ranking.sort((left, right) => right.value - left.value);
      const leader = ranking[0];
      document.getElementById("comparison-insight").textContent =
        `${{leader.name}} leads the selected window with a ${{leader.value.toFixed(2)}}% price change.`;
      Plotly.react("comparison", traces, comparisonLayout("Indexed performance (first close = 100)", "Indexed close"), {{ displayModeBar: false }});
      Plotly.react("ranking", [{{
        x: ranking.map((item) => item.value),
        y: ranking.map((item) => item.name),
        type: "bar",
        orientation: "h",
        marker: {{ color: "#4338ca" }}
      }}], comparisonLayout("Return ranking", "Return %"), {{ displayModeBar: false }});
    }}

    function draw() {{
      const data = selectedRows();
      document.querySelectorAll("#ranges button").forEach((button) => {{
        button.classList.toggle("active", button.dataset.key === selectedWindow);
      }});

      if (!data.length) {{
        document.getElementById("status").textContent =
          `No cached data for ${{symbolSelect.value}} in this window.`;
        ["close", "return", "highlow", "volume"].forEach((id) => {{
          document.getElementById(id).textContent = "—";
        }});
        Plotly.purge("price");
        drawComparison();
        return;
      }}

      const dates = data.map((row) => row.date);
      const closes = data.map((row) => row.close);
      const volumes = data.map((row) => row.volume || 0);
      const firstClose = closes[0];
      const lastClose = closes[closes.length - 1];

      document.getElementById("status").textContent =
        `${{symbolSelect.value}} · ${{dates[0]}} to ${{dates[dates.length - 1]}} · ${{data.length}} sessions`;
      document.getElementById("close").textContent = lastClose.toFixed(2);
      document.getElementById("return").textContent =
        `${{((lastClose / firstClose - 1) * 100).toFixed(2)}}%`;
      document.getElementById("highlow").textContent =
        `${{Math.max(...data.map((row) => row.high)).toFixed(2)}} / ${{Math.min(...data.map((row) => row.low)).toFixed(2)}}`;
      document.getElementById("volume").textContent =
        Math.round(volumes.reduce((sum, value) => sum + value, 0) / volumes.length).toLocaleString();

      Plotly.react(
        "price",
        [{{
          x: dates,
          open: data.map((row) => row.open),
          high: data.map((row) => row.high),
          low: data.map((row) => row.low),
          close: closes,
          type: "candlestick",
          increasing: {{ line: {{ color: "#6366f1" }} }},
          decreasing: {{ line: {{ color: "#312e81" }} }}
        }}],
        layout(`${{symbolSelect.value}} price action`),
        {{ displayModeBar: false, scrollZoom: false }}
      );
      drawComparison();
    }}

    symbolSelect.selectedIndex = 0;
    draw();
  </script>
</body>
</html>
"""

    output.write_text(html, encoding="utf-8")
    return output
