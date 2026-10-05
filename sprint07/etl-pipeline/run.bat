@echo off
REM Run Python ETL Pipeline on Windows

setlocal enabledelayedexpansion

REM Set environment variables
set DB_HOST=10.8.66.137
set DB_PORT=5432
set DB_NAME=trading_system
set DB_USERNAME=postgres
set DB_PASSWORD=n3u3d4!
set WAREHOUSE_DB_PATH=C:\Users\Administrator\sprint6\warehouse.duckdb

echo Setting up Python environment...

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not found! Install Python 3.8+
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Run ETL
echo.
echo Starting ETL Pipeline...
python -m etl_pipeline.app

pause
