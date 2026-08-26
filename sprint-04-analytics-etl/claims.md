# Claims

- The package installs in editable mode from the repository root.
- The `analytics-etl` command runs without input files.
- The pipeline exposes `extract`, `transform`, and `load` from `analytics_etl`.
- `extract()` calls the analytics API and receives candle records with ISO dates.
- `transform()` currently passes records through unchanged, and `load()` prints and writes `dummy_output.json`.
- The API key is read from the `API_KEY` environment variable and sent as the `x-api-key` header.

> Note: The teammate-facing entry point is the installed `analytics-etl` command.

Run the API pipeline with:

```text
analytics-etl
```

Set the key in PowerShell before running:

```powershell
$env:API_KEY = "your-api-key"
analytics-etl
```
