#!/bin/bash

set -e

echo "Loading database configuration..."

source .env

export PGPASSWORD=$POSTGRES_PASSWORD


echo "Applying initial schema..."
psql \
-h "$POSTGRES_HOST" \
-p "$POSTGRES_PORT" \
-U "$POSTGRES_USER" \
-d "$POSTGRES_DB" \
-f migrations/001_initial_trading_schema.sql


echo "Applying indexes..."
DATABASE="${TARGET_DATABASE:-$POSTGRES_DB}"

psql \
-h "$POSTGRES_HOST" \
-p "$POSTGRES_PORT" \
-U "$POSTGRES_USER" \
-d "$POSTGRES_DB" \
-f migrations/002_add_query_indexes.sql
if [ -z "$DATABASE" ]; then
    echo "ERROR: TARGET_DATABASE or POSTGRES_DB is not set."
    exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "Applying sprint changes..."

psql \
-h "$POSTGRES_HOST" \
-p "$POSTGRES_PORT" \
-U "$POSTGRES_USER" \
-d "$POSTGRES_DB" \
-f migrations/003_alter_schema_for_sprint05.sql
echo "Applying migrations..."

for file in migrations/*.sql
do
    echo "Applying migration: $file"

echo "Seeding initial data..."
    psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$DATABASE" \
        -v ON_ERROR_STOP=1 \
        -f "$file"
done


echo "Applying seed data..."

echo "Database setup completed successfully"
for file in seed/*.sql
do
    echo "Applying seed: $file"

    psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$DATABASE" \
        -v ON_ERROR_STOP=1 \
        -f "$file"
done

echo "Database migration completed successfully"

echo "Database successfully migrated and seeded."