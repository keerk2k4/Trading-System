#!/bin/bash
# Run Python ETL Pipeline on Linux/Mac

# Set environment variables
export DB_HOST=10.8.66.137
export DB_PORT=5432
export DB_NAME=trading_system
export DB_USERNAME=postgres
export DB_PASSWORD=n3u3d4!
export WAREHOUSE_DB_PATH=/app/warehouse.duckdb
export LOG_LEVEL=INFO

echo "Setting up Python environment..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python3 not found! Install Python 3.8+"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Run ETL
echo ""
echo "Starting ETL Pipeline..."
python3 -m etl_pipeline.app
