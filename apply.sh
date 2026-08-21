#!/bin/bash

set -e

DATABASE="${TARGET_DATABASE:-$POSTGRES_DB}"

for file in migrations/*.sql
do
    echo "Running migration: $file"

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
    echo "Running seed: $file"

    psql \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$DATABASE" \
        -v ON_ERROR_STOP=1 \
        -f "$file"
done
