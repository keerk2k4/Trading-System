#!/bin/bash

set -e

DATABASE="${TARGET_DATABASE:-$POSTGRES_DB}"

if [ -z "$DATABASE" ]; then
    echo "ERROR: TARGET_DATABASE or POSTGRES_DB is not set."
    exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

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
