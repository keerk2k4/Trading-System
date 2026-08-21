# Index Justifications

## Query 1 - Orders by Account

Query 1 searches the orders table using account_id.

Index:

    CREATE INDEX idx_orders_account_id
    ON orders(account_id);

This index allows PostgreSQL to find orders for an account more
efficiently without scanning the entire orders table.

The cost is additional storage and additional work when orders are
inserted or account_id is updated.


## Query 2 - Orders by Instrument

Query 2 searches the orders table using instrument_id.

Index:

    CREATE INDEX idx_orders_instrument_id
    ON orders(instrument_id);

This index allows PostgreSQL to find orders for a particular instrument
more efficiently.

The cost is additional storage and additional work when orders are
inserted or instrument_id is updated.


## Query 4 - Holdings by Account

Query 4 searches the holdings table using account_id.

Index:

    CREATE INDEX idx_holdings_account_id
    ON holdings(account_id);

This index allows PostgreSQL to find holdings for an account more
efficiently.

The cost is additional storage and additional work when holdings are
inserted or account_id is updated.


## Query 3 - Existing Index

Query 3 searches order_history using order_id.

The order_history table already has this primary key:

    PRIMARY KEY (order_id, status, timestamp)

PostgreSQL automatically creates an index for the primary key.

Because order_id is the first column of this primary key, the existing
index can support searches by order_id.

Therefore, no additional index is required for Query 3.


## Query 6

Query 6 uses a window function to rank holdings.

No additional index is created specifically for Query 6.

# Index Justifications

## Overview

Three indexes were added to support the named queries:

1. `idx_orders_account_id` on `orders(account_id)`
2. `idx_orders_instrument_id` on `orders(instrument_id)`
3. `idx_holdings_account_id` on `holdings(account_id)`

The indexes target columns used to filter rows in Queries 1, 2 and 4.

The database contains a small seed dataset, so PostgreSQL may choose sequential scans instead of the new indexes. This is expected because scanning a very small table can be cheaper than performing an index lookup.

---

## Index 1 — `idx_orders_account_id`

### Supporting query

Query 1 — Orders by account.

The query filters the `orders` table using:

```sql
WHERE o.account_id = 1
