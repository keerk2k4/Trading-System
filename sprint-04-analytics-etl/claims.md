# Claims

- The package installs in editable mode from the repository root.
- The `analytics-etl` command accepts an input `.json` or `.csv` path followed by an output `.json` path.
- The pipeline exposes `extract`, `transform`, and `load` from `analytics_etl`.

Run the pipeline with:

```text
analytics-etl input.json output.json
```

> Note: The teammate-facing entry point is the installed `analytics-etl` command.
