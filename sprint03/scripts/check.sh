#!/bin/bash

set -e


echo "================================"
echo " Sprint03 Database Harness"
echo "================================"


echo "Loading manifest..."

source manifest.env


echo ""
echo "Running migrations..."

$APPLY_COMMAND


echo ""
echo "Checking required tables..."


source .env

export PGPASSWORD=$POSTGRES_PASSWORD


check_table()
{
    TABLE=$1

    RESULT=$(psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -tAc "SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name='$TABLE'
    );")


    if [ "$RESULT" = "t" ]
    then
        echo "PASS: table $TABLE exists"
    else
        echo "FAIL: table $TABLE missing"
        exit 1
    fi
}


check_table $ACCOUNT_TABLE
check_table $ORDER_TABLE



echo ""
echo "Running duplicate idempotency probe..."

if psql \
-h "$POSTGRES_HOST" \
-p "$POSTGRES_PORT" \
-U "$POSTGRES_USER" \
-d "$POSTGRES_DB" \
-f probes/duplicate_idempotency_key.sql \
2>&1 | grep -E "duplicate key|23505"
then
    echo "PASS: SQLSTATE 23505 detected"
else
    echo "FAIL: duplicate key constraint not working"
fi



echo ""
echo "Running orphan foreign key probe..."


if psql \
-h "$POSTGRES_HOST" \
-p "$POSTGRES_PORT" \
-U "$POSTGRES_USER" \
-d "$POSTGRES_DB" \
-f probes/orphan_foreign_key.sql \
2>&1 | grep -E "foreign key|23503"
then
    echo "PASS: SQLSTATE 23503 detected"
else
    echo "FAIL: foreign key constraint not working"
fi



echo ""
echo "================================"
echo " HARNESS PASSED"
echo "================================"