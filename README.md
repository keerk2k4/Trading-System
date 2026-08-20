# Entity Relationship Diagram (ERD) -- Trading System

## 1. Overview

This document describes the database entities, attributes, primary keys,
foreign keys, and relationships for the trading system.

The database contains the following entities:

1.  USERS
2.  ACCOUNTS
3.  INSTRUMENTS
4.  ORDERS
5.  ORDER_HISTORY
6.  POSITIONS
7.  HOLDINGS
8.  WATCHLIST
9.  WATCHLIST_INST

The relationship between **USERS and ACCOUNTS is strictly 1:1**, as
specified.

------------------------------------------------------------------------

## 2. Entities

### 2.1 USERS

Stores information about users of the trading system.

  Attribute       Key   Description
  --------------- ----- --------------------------------
  `user_id`       PK    Unique identifier for the user
  `user_name`           User's name
  `password`            User's password
  `email`               User's email address
  `phonenumber`         User's phone number

**Primary Key:** `user_id`

------------------------------------------------------------------------

### 2.2 ACCOUNTS

Stores trading account information associated with a user.

  Attribute       Key   Description
  --------------- ----- -----------------------------------
  `account_id`    PK    Unique identifier for the account
  `account_num`         Account number
  `user_id`       FK    References `USERS.user_id`
  `balance`             Current account balance
  `status`              Account status
  `created_at`          Account creation timestamp

**Primary Key:** `account_id`

**Foreign Key:** - `user_id → USERS.user_id`

**Important:** Because USERS → ACCOUNTS is 1:1, `user_id` should be
unique in ACCOUNTS.

------------------------------------------------------------------------

### 2.3 INSTRUMENTS

Stores information about tradable financial instruments.

  Attribute         Key   Description
  ----------------- ----- -----------------------------------------------
  `instrument_id`   PK    Unique identifier for the instrument
  `ticker_symbol`         Ticker symbol
  `name`                  Instrument name
  `description`           Instrument description
  `status`                Instrument status
  `availability`          Whether the instrument is currently available
  `price`                 Current/latest price

**Primary Key:** `instrument_id`

------------------------------------------------------------------------

### 2.4 ORDERS

Stores orders submitted by trading accounts.

  Attribute         Key   Description
  ----------------- ----- ----------------------------------------
  `order_id`        PK    Unique identifier for the order
  `account_id`      FK    References `ACCOUNTS.account_id`
  `instrument_id`   FK    References `INSTRUMENTS.instrument_id`
  `action`                Buy or sell action
  `type`                  Order type
  `price`                 Order price
  `quantity`              Order quantity
  `timestamp`             Time the order was created

**Primary Key:** `order_id`

**Foreign Keys:** - `account_id → ACCOUNTS.account_id` -
`instrument_id → INSTRUMENTS.instrument_id`

------------------------------------------------------------------------

### 2.5 ORDER_HISTORY

Stores the status history of orders.

  Attribute     Key      Description
  ------------- -------- -------------------------------------------
  `order_id`    PK, FK   References `ORDERS.order_id`
  `status`      PK       Status of the order at that point in time
  `timestamp`   PK       Time the status was recorded

**Composite Primary Key:**

``` text
(order_id, status, timestamp)
```

**Foreign Key:** - `order_id → ORDERS.order_id`

An order can have multiple history records, for example:

``` text
ORDER CREATED
     ↓
PENDING
     ↓
EXECUTED
```

------------------------------------------------------------------------

### 2.6 POSITIONS

Stores account positions in financial instruments.

  Attribute          Key   Description
  ------------------ ----- ----------------------------------------
  `position_id`      PK    Unique identifier for the position
  `account_id`       FK    References `ACCOUNTS.account_id`
  `instrument_id`    FK    References `INSTRUMENTS.instrument_id`
  `status`                 Position status
  `total_quantity`         Total quantity
  `total_price`            Total value/price
  `as_of_date`             Date the position applies to
  `average_price`          Average acquisition/trade price
  `trade_type`             Type of trade

**Primary Key:** `position_id`

**Foreign Keys:** - `account_id → ACCOUNTS.account_id` -
`instrument_id → INSTRUMENTS.instrument_id`

------------------------------------------------------------------------

### 2.7 HOLDINGS

Stores account holdings in financial instruments.

  Attribute          Key   Description
  ------------------ ----- ----------------------------------------
  `holding_id`       PK    Unique identifier for the holding
  `account_id`       FK    References `ACCOUNTS.account_id`
  `instrument_id`    FK    References `INSTRUMENTS.instrument_id`
  `total_quantity`         Total quantity held
  `total_price`            Total value/price
  `as_of_date`             Date the holding applies to
  `average_price`          Average holding price

**Primary Key:** `holding_id`

**Foreign Keys:** - `account_id → ACCOUNTS.account_id` -
`instrument_id → INSTRUMENTS.instrument_id`

------------------------------------------------------------------------

### 2.8 WATCHLIST

Stores watchlists created by users.

  Attribute          Key   Description
  ------------------ ----- -------------------------------------
  `watchlist_id`     PK    Unique identifier for the watchlist
  `user_id`          FK    References `USERS.user_id`
  `watchlist_name`         Name of the watchlist
  `description`            Description of the watchlist
  `created_ts`             Creation timestamp
  `updated_ts`             Last update timestamp

**Primary Key:** `watchlist_id`

**Foreign Key:** - `user_id → USERS.user_id`

------------------------------------------------------------------------

### 2.9 WATCHLIST_INST

Junction table connecting watchlists and instruments.

  Attribute    Key      Description
  ------------ -------- ----------------------------------------
  `wlist_id`   PK, FK   References `WATCHLIST.watchlist_id`
  `inst_id`    PK, FK   References `INSTRUMENTS.instrument_id`

**Composite Primary Key:**

``` text
(wlist_id, inst_id)
```

**Foreign Keys:** - `wlist_id → WATCHLIST.watchlist_id` -
`inst_id → INSTRUMENTS.instrument_id`

This table implements the many-to-many relationship between WATCHLIST
and INSTRUMENTS.

------------------------------------------------------------------------

# 3. Relationships and Cardinality

## 3.1 USERS → ACCOUNTS

**Cardinality: 1:1**

One user has exactly one account, and one account belongs to exactly one
user.

``` text
USERS 1 ───────── 1 ACCOUNTS
```

Implementation:

``` text
ACCOUNTS.user_id → USERS.user_id
```

`ACCOUNTS.user_id` should be unique to enforce the 1:1 relationship.

------------------------------------------------------------------------

## 3.2 USERS → WATCHLIST

**Cardinality: 1:N**

One user can create multiple watchlists.

Each watchlist belongs to one user.

``` text
USERS 1 ───────── N WATCHLIST
```

Implementation:

``` text
WATCHLIST.user_id → USERS.user_id
```

Example:

``` text
User A
 ├── Watchlist 1
 ├── Watchlist 2
 └── Watchlist 3
```

------------------------------------------------------------------------

## 3.3 WATCHLIST → WATCHLIST_INST

**Cardinality: 1:N**

One watchlist can contain multiple records in the junction table.

``` text
WATCHLIST 1 ───────── N WATCHLIST_INST
```

Implementation:

``` text
WATCHLIST_INST.wlist_id → WATCHLIST.watchlist_id
```

------------------------------------------------------------------------

## 3.4 INSTRUMENTS → WATCHLIST_INST

**Cardinality: 1:N**

One instrument can appear in multiple `WATCHLIST_INST` records.

``` text
INSTRUMENTS 1 ───────── N WATCHLIST_INST
```

Implementation:

``` text
WATCHLIST_INST.inst_id → INSTRUMENTS.instrument_id
```

### Conceptual relationship

The overall relationship between WATCHLIST and INSTRUMENTS is therefore:

``` text
WATCHLIST N ───────── M INSTRUMENTS
```

The `WATCHLIST_INST` table resolves this many-to-many relationship.

------------------------------------------------------------------------

## 3.5 ACCOUNTS → ORDERS

**Cardinality: 1:N**

One account can place multiple orders.

Each order belongs to one account.

``` text
ACCOUNTS 1 ───────── N ORDERS
```

Implementation:

``` text
ORDERS.account_id → ACCOUNTS.account_id
```

------------------------------------------------------------------------

## 3.6 INSTRUMENTS → ORDERS

**Cardinality: 1:N**

One instrument can be associated with many orders.

Each order is associated with one instrument.

``` text
INSTRUMENTS 1 ───────── N ORDERS
```

Implementation:

``` text
ORDERS.instrument_id → INSTRUMENTS.instrument_id
```

------------------------------------------------------------------------

## 3.7 ORDERS → ORDER_HISTORY

**Cardinality: 1:N**

One order can have multiple order history records.

Each order history record belongs to one order.

``` text
ORDERS 1 ───────── N ORDER_HISTORY
```

Implementation:

``` text
ORDER_HISTORY.order_id → ORDERS.order_id
```

Example:

``` text
Order 1001
 ├── PENDING
 ├── PARTIALLY_FILLED
 └── FILLED
```

------------------------------------------------------------------------

## 3.8 ACCOUNTS → POSITIONS

**Cardinality: 1:N**

One account can have multiple positions.

Each position belongs to one account.

``` text
ACCOUNTS 1 ───────── N POSITIONS
```

Implementation:

``` text
POSITIONS.account_id → ACCOUNTS.account_id
```

------------------------------------------------------------------------

## 3.9 INSTRUMENTS → POSITIONS

**Cardinality: 1:N**

One instrument can appear in multiple positions across accounts.

Each position refers to one instrument.

``` text
INSTRUMENTS 1 ───────── N POSITIONS
```

Implementation:

``` text
POSITIONS.instrument_id → INSTRUMENTS.instrument_id
```

------------------------------------------------------------------------

## 3.10 ACCOUNTS → HOLDINGS

**Cardinality: 1:N**

One account can have multiple holdings.

Each holding belongs to one account.

``` text
ACCOUNTS 1 ───────── N HOLDINGS
```

Implementation:

``` text
HOLDINGS.account_id → ACCOUNTS.account_id
```

------------------------------------------------------------------------

## 3.11 INSTRUMENTS → HOLDINGS

**Cardinality: 1:N**

One instrument can be held by multiple accounts.

Each holding refers to one instrument.

``` text
INSTRUMENTS 1 ───────── N HOLDINGS
```

Implementation:

``` text
HOLDINGS.instrument_id → INSTRUMENTS.instrument_id
```

------------------------------------------------------------------------

# 4. Complete Relationship Summary

  -----------------------------------------------------------------------------------------
  \#             Parent         Child            Cardinality    Foreign Key
  -------------- -------------- ---------------- -------------- ---------------------------
  1              USERS          ACCOUNTS         **1:1**        `ACCOUNTS.user_id`

  2              USERS          WATCHLIST        **1:N**        `WATCHLIST.user_id`

  3              WATCHLIST      WATCHLIST_INST   **1:N**        `WATCHLIST_INST.wlist_id`

  4              INSTRUMENTS    WATCHLIST_INST   **1:N**        `WATCHLIST_INST.inst_id`

  5              ACCOUNTS       ORDERS           **1:N**        `ORDERS.account_id`

  6              INSTRUMENTS    ORDERS           **1:N**        `ORDERS.instrument_id`

  7              ORDERS         ORDER_HISTORY    **1:N**        `ORDER_HISTORY.order_id`

  8              ACCOUNTS       POSITIONS        **1:N**        `POSITIONS.account_id`

  9              INSTRUMENTS    POSITIONS        **1:N**        `POSITIONS.instrument_id`

  10             ACCOUNTS       HOLDINGS         **1:N**        `HOLDINGS.account_id`

  11             INSTRUMENTS    HOLDINGS         **1:N**        `HOLDINGS.instrument_id`
  -----------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 5. Complete ERD Structure

``` text
                         ┌──────────────┐
                         │    USERS     │
                         └──────┬───────┘
                                │
                              1:1
                                │
                         ┌──────▼───────┐
                         │   ACCOUNTS   │
                         └──────┬───────┘
                                │
                 ┌──────────────┼──────────────┐
                1:N            1:N             1:N
                 │              │               │
          ┌──────▼──────┐ ┌─────▼─────┐  ┌────▼──────┐
          │   ORDERS    │ │ POSITIONS │  │ HOLDINGS  │
          └──────┬──────┘ └─────┬─────┘  └────┬──────┘
                 │               │              │
                1:N             N:1            N:1
                 │               │              │
          ┌──────▼───────┐      │              │
          │ ORDER_HISTORY │      │              │
          └───────────────┘      │              │
                                 │              │
                                 └──────┬───────┘
                                        │
                                        │
                                ┌───────▼────────┐
                                │  INSTRUMENTS   │
                                └───────┬────────┘
                                        │
                                        │ 1:N
                                        │
                              ┌─────────▼─────────┐
                              │  WATCHLIST_INST   │
                              └─────────▲─────────┘
                                        │
                                        │ 1:N
                              ┌─────────┴─────────┐
                              │     WATCHLIST     │
                              └───────────────────┘
                                        ▲
                                        │
                                        │ N:1
                                        │
                                     USERS
```

------------------------------------------------------------------------

# 6. Relationship Model

The database can be summarized as follows:

``` text
USERS
  │
  ├── 1:1 ── ACCOUNTS
  │            │
  │            ├── 1:N ── ORDERS ── 1:N ── ORDER_HISTORY
  │            │       │
  │            │       └── N:1 ── INSTRUMENTS
  │            │
  │            ├── 1:N ── POSITIONS ── N:1 ── INSTRUMENTS
  │            │
  │            └── 1:N ── HOLDINGS ── N:1 ── INSTRUMENTS
  │
  └── 1:N ── WATCHLIST
                │
                └── 1:N ── WATCHLIST_INST ── N:1 ── INSTRUMENTS
```

------------------------------------------------------------------------

# 7. Primary and Foreign Key Summary

  Table            Primary Key                       Foreign Keys
  ---------------- --------------------------------- -------------------------------
  USERS            `user_id`                         None
  ACCOUNTS         `account_id`                      `user_id`
  INSTRUMENTS      `instrument_id`                   None
  ORDERS           `order_id`                        `account_id`, `instrument_id`
  ORDER_HISTORY    `order_id + status + timestamp`   `order_id`
  POSITIONS        `position_id`                     `account_id`, `instrument_id`
  HOLDINGS         `holding_id`                      `account_id`, `instrument_id`
  WATCHLIST        `watchlist_id`                    `user_id`
  WATCHLIST_INST   `wlist_id + inst_id`              `wlist_id`, `inst_id`

------------------------------------------------------------------------

# 8. Notes and Design Decisions

### 8.1 USERS and ACCOUNTS

The relationship is intentionally **1:1**.

To enforce this at the database level, `ACCOUNTS.user_id` should have a
`UNIQUE` constraint.

Example:

``` sql
user_id INT NOT NULL UNIQUE
```

This prevents multiple accounts from being assigned to the same user.

### 8.2 WATCHLIST and INSTRUMENTS

The conceptual relationship is **many-to-many**:

``` text
WATCHLIST N:M INSTRUMENTS
```

It is implemented using:

``` text
WATCHLIST_INST
```

with a composite primary key:

``` text
PRIMARY KEY (wlist_id, inst_id)
```

### 8.3 ORDER_HISTORY

`ORDER_HISTORY` uses a composite primary key:

``` text
PRIMARY KEY (order_id, status, timestamp)
```

This allows an order to have multiple status changes over time.

------------------------------------------------------------------------

# 9. Final Cardinality List

``` text
USERS        1 : 1  ACCOUNTS

USERS        1 : N  WATCHLIST

WATCHLIST    1 : N  WATCHLIST_INST
INSTRUMENTS  1 : N  WATCHLIST_INST

WATCHLIST    N : M  INSTRUMENTS    [Conceptual]

ACCOUNTS     1 : N  ORDERS
INSTRUMENTS  1 : N  ORDERS

ORDERS       1 : N  ORDER_HISTORY

ACCOUNTS     1 : N  POSITIONS
INSTRUMENTS  1 : N  POSITIONS

ACCOUNTS     1 : N  HOLDINGS
INSTRUMENTS  1 : N  HOLDINGS
```

## 10. Entity Count

**Total entities/tables: 9**

``` text
1. USERS
2. ACCOUNTS
3. INSTRUMENTS
4. ORDERS
5. ORDER_HISTORY
6. POSITIONS
7. HOLDINGS
8. WATCHLIST
9. WATCHLIST_INST
```
