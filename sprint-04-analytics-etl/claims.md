# Claims

- The package installs in editable mode from the repository root.
- The `analytics-etl --mock-api` command runs without input files.
- The pipeline exposes `extract`, `transform`, and `load` from `analytics_etl`.
- `extract()` calls a nonexistent mock API and receives dummy records with `dd-mm-yyyy` dates.
- `transform()` converts dates to `dd/mm/yyyy`, and `load()` prints and writes `dummy_output.json`.

> Note: The teammate-facing entry point is the installed `analytics-etl` command.

Try the mock API demonstration with:

```text
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .\sprint-04-analytics-etl
analytics-etl --mock-api
```
