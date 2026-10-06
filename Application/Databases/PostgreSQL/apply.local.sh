#!/bin/bash

set -e

# Local, in-file configuration (no env var dependency for DB connection details)
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="n3u3d4!"
DATABASE="trading_system"

export PGPASSWORD="$POSTGRES_PASSWORD"

# Never page query output. Some migrations/seeds print a result (e.g.
# SELECT setval(...)); in an interactive terminal psql would open a pager and
# wait for a key press while the migration transaction is still open, holding
# its locks and silently stalling the whole run.
export PAGER=cat
export PSQL_PAGER=cat

# Drop all existing tables and start fresh
echo "Dropping all existing tables..."
psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$DATABASE" \
    -c "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS trading CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

echo "Setting bootstrap search_path to public..."
psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$DATABASE" \
    -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE \"$DATABASE\" SET search_path TO public;"

for file in migrations/*.sql
do
    echo "Applying migration: $file"

    psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$DATABASE" \
        -v ON_ERROR_STOP=1 \
        -f "$file"
done

echo "Setting database search_path..."
psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$DATABASE" \
    -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE \"$DATABASE\" SET search_path TO auth, trading, public;"

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

echo "Database successfully migrated and seeded."